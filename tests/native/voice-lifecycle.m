#import <Foundation/Foundation.h>
#include "../../src-tauri/src/voice.m"

static NSUInteger Destroyed;
static NSUInteger Ended;
static void Reply(const char *json) { if (strstr(json, "ended")) Ended++; }
@interface TrackedVoiceSession : YoziVoiceSession
@end
@implementation TrackedVoiceSession
- (void)dealloc { Destroyed++; }
@end
static void Require(BOOL value, const char *message) {
    if (!value) { fprintf(stderr, "%s\n", message); exit(2); }
}
static void Prepare(void) {
    Require(ActiveVoice == nil, "previous session retained");
    ActiveVoice = [TrackedVoiceSession new];
    ActiveVoice.sid = @"fixture";
    ActiveVoice.locale = @"zh-CN";
    ActiveVoice.text = @"uncommitted fixture";
    ActiveVoice.reply = Reply;
}
static void DrainMainQueue(void) {
    __block BOOL drained = NO;
    dispatch_async(dispatch_get_main_queue(), ^{ drained = YES; });
    for (int i = 0; i < 100 && !drained; i++) {
        [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.01]];
    }
    Require(drained, "main queue did not drain");
}
int main(void) {
    @autoreleasepool {
        Prepare();
        [ActiveVoice cancel];
        Require(ActiveVoice == nil && Destroyed == 1, "direct cancellation leaked");
        Prepare();
        yozi_voice_cancel_all();
        Require(ActiveVoice == nil && Destroyed == 2, "shutdown cancellation leaked");
        Prepare();
        yozi_voice_cancel("different-session");
        DrainMainQueue();
        Require(ActiveVoice != nil && Destroyed == 2, "stale cancellation changed active session");
        yozi_voice_cancel("fixture");
        DrainMainQueue();
        Require(ActiveVoice == nil && Destroyed == 3, "queued cancellation leaked");
        Prepare();
        [ActiveVoice finish];
        Require(ActiveVoice == nil && Destroyed == 4 && Ended == 1, "finish before capture leaked");
        Prepare();
        [ActiveVoice fail:@"fixture_failure"];
        Require(ActiveVoice == nil && Destroyed == 5, "failure cancellation leaked");
        puts("{\"checks\":6,\"audioCapture\":false,\"permissionRequests\":false}");
    }
    return 0;
}
