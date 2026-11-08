#import "YoziStudyCompanion.h"
#import <UserNotifications/UserNotifications.h>
#import <WatchConnectivity/WatchConnectivity.h>
#import <math.h>

static NSString *const StudyPrefix = @"yozi.study.";
static NSString *const GlanceContract = @"glance-v1";

@interface YoziStudyCompanion () <WCSessionDelegate>
@property(nonatomic, copy) NSDictionary *glance;
@property(nonatomic) NSUInteger revision;
@end

@implementation YoziStudyCompanion
+ (instancetype)shared {
    static YoziStudyCompanion *bridge;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ bridge = [YoziStudyCompanion new]; });
    return bridge;
}

static NSString *permissionLabel(UNAuthorizationStatus status) {
    switch (status) {
        case UNAuthorizationStatusNotDetermined: return @"default";
        case UNAuthorizationStatusDenied: return @"denied";
        case UNAuthorizationStatusAuthorized: return @"granted";
        default: return @"denied";
    }
}

- (void)permission:(BOOL)request completion:(void (^)(NSDictionary *))completion {
    UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
    if (request) {
        [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound)
                              completionHandler:^(BOOL allowed, NSError *error) {
            completion(@{@"permission": allowed && !error ? @"granted" : @"denied"});
        }];
    } else {
        [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
            completion(@{@"permission": permissionLabel(settings.authorizationStatus)});
        }];
    }
}

static BOOL countValue(id value) {
    if (![value isKindOfClass:NSNumber.class]) return NO;
    double number = [value doubleValue];
    return isfinite(number) && number >= 0 && floor(number) == number;
}

static NSString *reminderText(id kind, BOOL english) {
    if ([kind isEqual:@"study"]) return english ? @"It’s time for the study session you planned." : @"到了你安排的学习时间。";
    if ([kind isEqual:@"review"]) return english ? @"A review is due." : @"有学习任务到期，打开后独立复测。";
    if ([kind isEqual:@"recap"]) return english ? @"Review today and plan your next step." : @"回顾今天的学习，确认下一步安排。";
    return nil;
}

static NSDictionary *safeGlance(id value) {
    NSDictionary *empty = @{@"contract": GlanceContract, @"available": @NO};
    if (![value isKindOfClass:NSDictionary.class] || ![value[@"contract"] isEqual:GlanceContract] ||
        ![value[@"available"] isEqual:@YES]) return empty;
    NSNumber *done = value[@"done"], *total = value[@"total"], *due = value[@"due"];
    if (!countValue(done) || !countValue(total) || !countValue(due) || [done compare:total] == NSOrderedDescending) return empty;
    NSMutableDictionary *snapshot = [@{@"contract": GlanceContract, @"available": @YES, @"done": done, @"total": total, @"due": due} mutableCopy];
    if (countValue(value[@"nextAt"]) && reminderText(value[@"nextKind"], NO)) {
        snapshot[@"nextAt"] = value[@"nextAt"];
        snapshot[@"nextKind"] = value[@"nextKind"];
    }
    return snapshot;
}

- (void)sendGlance:(WCSession *)session {
    if (session.activationState == WCSessionActivationStateActivated && self.glance &&
        ![session.applicationContext isEqualToDictionary:self.glance]) {
        [session updateApplicationContext:self.glance error:NULL];
    }
}

- (void)session:(WCSession *)session activationDidCompleteWithState:(WCSessionActivationState)state error:(NSError *)error {
    dispatch_async(dispatch_get_main_queue(), ^{ [self sendGlance:session]; });
}
- (void)sessionDidBecomeInactive:(WCSession *)session {}
- (void)sessionDidDeactivate:(WCSession *)session { [session activateSession]; }
- (void)sessionWatchStateDidChange:(WCSession *)session {
    dispatch_async(dispatch_get_main_queue(), ^{ [self sendGlance:session]; });
}

- (void)apply:(NSDictionary *)input completion:(void (^)(NSDictionary *))completion {
    if (![input isKindOfClass:NSDictionary.class]) {
        completion(@{@"ok": @NO, @"acceptedIds": @[]});
        return;
    }
    NSDictionary *snapshot = safeGlance(input[@"glance"]);
    NSArray *jobs = [input[@"jobs"] isKindOfClass:NSArray.class] ? input[@"jobs"] : @[];
    BOOL english = [input[@"language"] isEqual:@"en"];
    dispatch_async(dispatch_get_main_queue(), ^{
        NSUInteger current = ++self.revision;
        self.glance = snapshot;
        if (WCSession.isSupported) {
            WCSession *session = WCSession.defaultSession;
            if (session.delegate != self) {
                session.delegate = self;
                [session activateSession];
            }
            [self sendGlance:session];
        }
        UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
        [center getPendingNotificationRequestsWithCompletionHandler:^(NSArray<UNNotificationRequest *> *existing) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (current != self.revision) {
                    completion(@{@"ok": @NO, @"acceptedIds": @[]});
                    return;
                }
                NSMutableDictionary<NSString *, UNNotificationRequest *> *desired = [NSMutableDictionary dictionary];
                for (id job in jobs) {
                    if (![job isKindOfClass:NSDictionary.class]) continue;
                    NSString *identifier = job[@"id"];
                    NSString *message = reminderText(job[@"kind"], english);
                    NSNumber *dueAt = job[@"dueAt"];
                    if (![identifier isKindOfClass:NSString.class] || identifier.length == 0 || !message || !countValue(dueAt)) continue;
                    NSTimeInterval delay = dueAt.doubleValue / 1000 - NSDate.date.timeIntervalSince1970;
                    if (delay <= 0) continue;
                    UNMutableNotificationContent *content = [UNMutableNotificationContent new];
                    content.title = @"Yozi AI";
                    content.body = message;
                    content.sound = UNNotificationSound.defaultSound;
                    UNTimeIntervalNotificationTrigger *trigger = [UNTimeIntervalNotificationTrigger triggerWithTimeInterval:delay repeats:NO];
                    NSString *key = [StudyPrefix stringByAppendingString:identifier];
                    desired[key] = [UNNotificationRequest requestWithIdentifier:key content:content trigger:trigger];
                }
                NSMutableArray *remove = [NSMutableArray array];
                NSMutableArray *accepted = [NSMutableArray array];
                for (UNNotificationRequest *request in existing) {
                    NSString *identifier = request.identifier;
                    if (![identifier hasPrefix:StudyPrefix]) continue;
                    if (desired[identifier]) {
                        [accepted addObject:[identifier substringFromIndex:StudyPrefix.length]];
                        [desired removeObjectForKey:identifier];
                    } else [remove addObject:identifier];
                }
                [center removePendingNotificationRequestsWithIdentifiers:remove];
                dispatch_group_t pending = dispatch_group_create();
                for (NSString *key in desired) {
                    dispatch_group_enter(pending);
                    [center addNotificationRequest:desired[key] withCompletionHandler:^(NSError *error) {
                        dispatch_async(dispatch_get_main_queue(), ^{
                            if (!error) [accepted addObject:[key substringFromIndex:StudyPrefix.length]];
                            dispatch_group_leave(pending);
                        });
                    }];
                }
                dispatch_group_notify(pending, dispatch_get_main_queue(), ^{
                    completion(@{@"ok": @(current == self.revision && accepted.count == jobs.count),
                                 @"acceptedIds": accepted});
                });
            });
        }];
    });
}
@end
