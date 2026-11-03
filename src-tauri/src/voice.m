#import <Foundation/Foundation.h>
#import <Speech/Speech.h>
#import <AVFoundation/AVFoundation.h>

// Audio buffers stay in AVFoundation/Speech. Only text and bounded status leave this bridge.
typedef void (*VoiceReply)(const char *);
static void OnMain(dispatch_block_t block) {
    if ([NSThread isMainThread]) block();
    else dispatch_sync(dispatch_get_main_queue(), block);
}
static char *VoiceJSON(NSDictionary *value) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    if (!data) return NULL;
    char *reply = malloc(data.length + 1);
    if (!reply) return NULL;
    memcpy(reply, data.bytes, data.length); reply[data.length] = 0;
    return reply;
}
static SFSpeechRecognizer *Recognizer(NSString *locale) {
    if (![@[@"zh-CN", @"en-US"] containsObject:locale]) return nil;
    SFSpeechRecognizer *recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:locale]];
    // initWithLocale may fall back to the keyboard language. Never adopt that fallback.
    return [recognizer.locale.localeIdentifier isEqualToString:locale] ? recognizer : nil;
}
static NSDictionary *Capability(NSString *locale) {
    SFSpeechRecognizer *recognizer = Recognizer(locale);
    BOOL local = recognizer && recognizer.supportsOnDeviceRecognition;
    BOOL available = local && recognizer.isAvailable;
    SFSpeechRecognizerAuthorizationStatus speech = [SFSpeechRecognizer authorizationStatus];
    AVAuthorizationStatus microphone = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
    NSString *reason = available ? @"" : local ? @"recognizer_unavailable" : @"on_device_unavailable";
    if (speech == SFSpeechRecognizerAuthorizationStatusDenied || speech == SFSpeechRecognizerAuthorizationStatusRestricted) {
        available = NO; reason = @"speech_denied";
    } else if (microphone == AVAuthorizationStatusDenied || microphone == AVAuthorizationStatusRestricted) {
        available = NO; reason = @"microphone_denied";
    }
    return @{@"platform":@"macos", @"supported":@(local), @"available":@(available), @"locale":locale,
        @"reason":reason, @"speechAuthorization":@(speech), @"microphoneAuthorization":@(microphone)};
}

@interface YoziVoiceSession : NSObject
@property(nonatomic, copy) NSString *sid;
@property(nonatomic, copy) NSString *locale;
@property(nonatomic, copy) NSString *text;
@property(nonatomic, assign) VoiceReply reply;
@property(nonatomic) NSUInteger seq;
@property(atomic) BOOL finishing;
@property(nonatomic) BOOL tapped;
@property(nonatomic, strong) AVAudioEngine *engine;
@property(nonatomic, strong) SFSpeechRecognizer *recognizer;
@property(atomic, strong) SFSpeechAudioBufferRecognitionRequest *request;
@property(nonatomic, strong) SFSpeechRecognitionTask *task;
@property(nonatomic, strong) id configurationObserver;
- (void)authorize;
- (void)finish;
- (void)cancel;
@end
static YoziVoiceSession *ActiveVoice;

@implementation YoziVoiceSession
- (void)emit:(NSString *)kind reason:(NSString *)reason {
    if (ActiveVoice != self) return;
    char *json = VoiceJSON(@{@"sid":self.sid, @"seq":@(++self.seq), @"kind":kind,
        @"text":self.text ?: @"", @"reason":reason ?: @""});
    if (json) { self.reply(json); free(json); }
}
- (void)stopAudio {
    if (self.configurationObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver:self.configurationObserver];
        self.configurationObserver = nil;
    }
    if (self.tapped) {
        self.tapped = NO;
        [self.engine.inputNode removeTapOnBus:0];
    }
    [self.engine stop];
}
- (void)cancel {
    // Detach callbacks immediately, but keep the receiver alive through teardown.
    __attribute__((objc_precise_lifetime)) YoziVoiceSession *session = self;
    session.finishing = YES;
    if (ActiveVoice == session) ActiveVoice = nil;
    [session stopAudio];
    [session.task cancel];
    session.task = nil; session.request = nil; session.engine = nil; session.recognizer = nil;
    session.text = @"";
}
- (void)fail:(NSString *)reason {
    if (ActiveVoice != self) return;
    [self emit:@"error" reason:reason];
    [self cancel];
}
- (void)capture {
    if (ActiveVoice != self) return;
    self.recognizer = Recognizer(self.locale);
    if (!self.recognizer.supportsOnDeviceRecognition || !self.recognizer.isAvailable) {
        [self fail:@"on_device_unavailable"]; return;
    }
    self.recognizer.queue = [NSOperationQueue mainQueue];
    self.request = [SFSpeechAudioBufferRecognitionRequest new];
    self.request.requiresOnDeviceRecognition = YES;
    self.request.shouldReportPartialResults = YES;
    self.request.taskHint = SFSpeechRecognitionTaskHintDictation;
    if (@available(macOS 13.0, *)) self.request.addsPunctuation = YES;
    self.engine = [AVAudioEngine new];
    __weak YoziVoiceSession *weakSelf = self;
    @try {
        AVAudioInputNode *input = self.engine.inputNode;
        AVAudioFormat *format = [input outputFormatForBus:0];
        if (format.channelCount == 0 || format.sampleRate <= 0) { [self fail:@"input_unavailable"]; return; }
        self.task = [self.recognizer recognitionTaskWithRequest:self.request resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
            YoziVoiceSession *session = weakSelf;
            if (!session || ActiveVoice != session) return;
            if (result) {
                session.text = result.bestTranscription.formattedString ?: @"";
                [session emit:result.isFinal ? @"final" : @"partial" reason:@""];
                if (result.isFinal) {
                    [session emit:@"ended" reason:@"completed"];
                    [session cancel]; return;
                }
            }
            if (error) [session fail:[NSString stringWithFormat:@"recognition_failed:%ld", (long)error.code]];
        }];
        [input installTapOnBus:0 bufferSize:1024 format:format block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
            YoziVoiceSession *session = weakSelf;
            if (session && !session.finishing) [session.request appendAudioPCMBuffer:buffer];
        }];
        self.tapped = YES;
        self.configurationObserver = [[NSNotificationCenter defaultCenter]
            addObserverForName:AVAudioEngineConfigurationChangeNotification object:self.engine
            queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *note) { [weakSelf fail:@"input_changed"]; }];
        NSError *error = nil;
        [self.engine prepare];
        if (![self.engine startAndReturnError:&error]) { [self fail:@"input_unavailable"]; return; }
        [self emit:@"partial" reason:@"recording_started"];
    } @catch (NSException *exception) {
        [self fail:@"input_unavailable"]; return;
    }
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 60 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        YoziVoiceSession *session = weakSelf;
        if (session && ActiveVoice == session) [session finish];
    });
}
- (void)authorizeMicrophone {
    if (ActiveVoice != self) return;
    AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
    if (status == AVAuthorizationStatusAuthorized) { [self capture]; return; }
    if (status != AVAuthorizationStatusNotDetermined) { [self fail:@"microphone_denied"]; return; }
    __weak YoziVoiceSession *weakSelf = self;
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (granted) [weakSelf capture]; else [weakSelf fail:@"microphone_denied"];
        });
    }];
}
- (void)authorize {
    if (ActiveVoice != self) return;
    if (![Capability(self.locale)[@"available"] boolValue]) { [self fail:@"on_device_unavailable"]; return; }
    SFSpeechRecognizerAuthorizationStatus status = [SFSpeechRecognizer authorizationStatus];
    if (status == SFSpeechRecognizerAuthorizationStatusAuthorized) { [self authorizeMicrophone]; return; }
    if (status != SFSpeechRecognizerAuthorizationStatusNotDetermined) { [self fail:@"speech_denied"]; return; }
    __weak YoziVoiceSession *weakSelf = self;
    [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus value) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (value == SFSpeechRecognizerAuthorizationStatusAuthorized) [weakSelf authorizeMicrophone];
            else [weakSelf fail:@"speech_denied"];
        });
    }];
}
- (void)finish {
    if (ActiveVoice != self || self.finishing) return;
    if (!self.request) { [self emit:@"ended" reason:@"not_started"]; [self cancel]; return; }
    self.finishing = YES;
    [self stopAudio];
    [self.request endAudio];
    [self.task finish];
    __weak YoziVoiceSession *weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        YoziVoiceSession *session = weakSelf;
        if (session && ActiveVoice == session) {
            [session emit:@"ended" reason:@"final_timeout"];
            [session cancel];
        }
    });
}
@end

char *yozi_voice_capability(const char *locale) {
    NSString *language = [NSString stringWithUTF8String:locale];
    __block char *reply = NULL;
    OnMain(^{ reply = VoiceJSON(Capability(language)); });
    return reply;
}
void yozi_voice_free(char *reply) { free(reply); }
void yozi_voice_start(const char *sid, const char *locale, VoiceReply reply) {
    NSString *identifier = [NSString stringWithUTF8String:sid];
    NSString *language = [NSString stringWithUTF8String:locale];
    // Always enqueue: the Rust command can finish installing its channel before callbacks.
    dispatch_async(dispatch_get_main_queue(), ^{
        [ActiveVoice cancel];
        YoziVoiceSession *session = [YoziVoiceSession new];
        session.sid = identifier; session.locale = language; session.reply = reply; session.text = @"";
        ActiveVoice = session;
        [session authorize];
    });
}
void yozi_voice_stop(const char *sid) {
    NSString *identifier = [NSString stringWithUTF8String:sid];
    dispatch_async(dispatch_get_main_queue(), ^{
        if ([ActiveVoice.sid isEqualToString:identifier]) [ActiveVoice finish];
    });
}
void yozi_voice_cancel(const char *sid) {
    NSString *identifier = [NSString stringWithUTF8String:sid];
    dispatch_async(dispatch_get_main_queue(), ^{
        if ([ActiveVoice.sid isEqualToString:identifier]) [ActiveVoice cancel];
    });
}
void yozi_voice_cancel_all(void) { OnMain(^{ [ActiveVoice cancel]; }); }
