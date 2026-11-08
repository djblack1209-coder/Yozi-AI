#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN
@interface YoziStudyCompanion : NSObject
+ (instancetype)shared;
- (void)permission:(BOOL)request completion:(void (^)(NSDictionary *))completion;
- (void)clearGlance:(void (^)(void))completion;
- (void)apply:(NSDictionary *)input completion:(void (^)(NSDictionary *))completion;
@end
NS_ASSUME_NONNULL_END
