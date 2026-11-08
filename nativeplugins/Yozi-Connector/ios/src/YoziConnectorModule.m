#import "YoziConnectorModule.h"
#import "YoziConnectorTransport.h"
#import "YoziMaterialFiles.h"
#import "YoziStudyCompanion.h"
@implementation YoziConnectorModule { YoziConnectorTransport *_transport;YoziMaterialFiles *_files;UIDocumentPickerViewController *_picker;NSString *_pickerId;UniModuleKeepAliveCallback _pickerCallback; }
UNI_EXPORT_METHOD_SYNC(@selector(getCapabilities))
UNI_EXPORT_METHOD(@selector(request:callback:))
UNI_EXPORT_METHOD(@selector(stream:callback:))
UNI_EXPORT_METHOD(@selector(cancel:))
UNI_EXPORT_METHOD(@selector(chooseMaterialFile:callback:))
UNI_EXPORT_METHOD(@selector(readMaterialFile:callback:))
UNI_EXPORT_METHOD(@selector(releaseMaterialFile:))
UNI_EXPORT_METHOD(@selector(cancelFileOperation:))
UNI_EXPORT_METHOD(@selector(studyNotificationPermission:callback:))
UNI_EXPORT_METHOD(@selector(applyStudyCompanion:callback:))
UNI_EXPORT_METHOD(@selector(openStudyNotificationSettings:callback:))
- (instancetype)init {if((self=[super init])){_transport=[YoziConnectorTransport new];_files=[YoziMaterialFiles new];}return self;}
- (NSDictionary *)getCapabilities {NSMutableDictionary *caps=[YoziConnectorTransport.capabilities mutableCopy];caps[@"file"]=YoziMaterialFiles.capabilities;return caps;}
- (void)request:(NSDictionary *)options callback:(UniModuleKeepAliveCallback)callback {
    [_transport request:options completion:^(NSDictionary *value){dispatch_async(dispatch_get_main_queue(),^{if(callback)callback(value,NO);});}];
}
- (void)stream:(NSDictionary *)options callback:(UniModuleKeepAliveCallback)callback {
    [_transport stream:options completion:^(NSDictionary *value){NSMutableDictionary *envelope=[value mutableCopy];NSData *chunk=envelope[@"chunk"];[envelope removeObjectForKey:@"chunk"];if(chunk)envelope[@"data"]=[chunk base64EncodedStringWithOptions:0];BOOL keep=[@[@"headers",@"chunk"] containsObject:envelope[@"kind"]];dispatch_async(dispatch_get_main_queue(),^{if(callback)callback(envelope,keep);});}];
}
- (void)cancel:(NSString *)identifier {[_transport cancel:identifier];}
static void complete(UniModuleKeepAliveCallback callback,NSDictionary *value){dispatch_async(dispatch_get_main_queue(),^{if(callback)callback(value,NO);});}
- (void)studyNotificationPermission:(NSDictionary *)options callback:(UniModuleKeepAliveCallback)callback {
    BOOL request = [options isKindOfClass:NSDictionary.class] && [options[@"request"] isEqual:@YES];
    [YoziStudyCompanion.shared permission:request completion:^(NSDictionary *value){complete(callback,value);}];
}
- (void)applyStudyCompanion:(NSDictionary *)options callback:(UniModuleKeepAliveCallback)callback {
    [YoziStudyCompanion.shared apply:options completion:^(NSDictionary *value){complete(callback,value);}];
}
- (void)openStudyNotificationSettings:(NSDictionary *)options callback:(UniModuleKeepAliveCallback)callback {
    dispatch_async(dispatch_get_main_queue(), ^{
        [UIApplication.sharedApplication openURL:[NSURL URLWithString:UIApplicationOpenSettingsURLString]
                                        options:@{} completionHandler:^(BOOL ok){complete(callback,@{@"ok":@(ok)});}];
    });
}
static UIViewController *presenter(void){
    UIWindow *window=nil;
    if(@available(iOS 13.0,*)){for(UIScene *scene in UIApplication.sharedApplication.connectedScenes)if(scene.activationState==UISceneActivationStateForegroundActive && [scene isKindOfClass:UIWindowScene.class])for(UIWindow *candidate in ((UIWindowScene *)scene).windows)if(candidate.isKeyWindow)window=candidate;}
    else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
        window=UIApplication.sharedApplication.keyWindow;
#pragma clang diagnostic pop
    }
    UIViewController *view=window.rootViewController;
    for(NSUInteger i=0;i<20 && view;i++){UIViewController *next=view.presentedViewController;if(!next && [view isKindOfClass:UINavigationController.class])next=((UINavigationController *)view).visibleViewController;if(!next && [view isKindOfClass:UITabBarController.class])next=((UITabBarController *)view).selectedViewController;if(!next || next==view)break;view=next;}return view;
}
- (void)chooseMaterialFile:(NSDictionary *)options callback:(UniModuleKeepAliveCallback)callback {
    NSString *identifier=[options isKindOfClass:NSDictionary.class]?options[@"id"]:nil;
    if(![identifier isKindOfClass:NSString.class] || ![[NSPredicate predicateWithFormat:@"SELF MATCHES %@",@"[A-Za-z0-9_-]{1,128}"] evaluateWithObject:identifier]){complete(callback,@{@"id":@"",@"code":@"INVALID_REQUEST"});return;}
    UIViewController *view=presenter();if(_picker || !view || view.isBeingDismissed){complete(callback,@{@"id":identifier,@"code":@"BUSY"});return;}
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    _picker=[[UIDocumentPickerViewController alloc] initWithDocumentTypes:@[@"com.adobe.pdf",@"public.png",@"public.jpeg"] inMode:UIDocumentPickerModeOpen];
#pragma clang diagnostic pop
    _picker.allowsMultipleSelection=NO;_picker.delegate=self;_pickerId=identifier;_pickerCallback=[callback copy];[view presentViewController:_picker animated:YES completion:nil];
}
- (void)documentPicker:(UIDocumentPickerViewController *)controller didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls {
    if(controller!=_picker || !_pickerId)return;NSString *identifier=_pickerId;UniModuleKeepAliveCallback callback=_pickerCallback;_pickerId=nil;_pickerCallback=nil;_picker=nil;
    if(urls.count!=1){complete(callback,@{@"id":identifier,@"code":@"INVALID_REQUEST"});return;}
    [_files selectURL:urls[0] identifier:identifier completion:^(NSDictionary *value){complete(callback,value);}];
}
- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)controller {
    if(controller!=_picker || !_pickerId)return;NSString *identifier=_pickerId;UniModuleKeepAliveCallback callback=_pickerCallback;_pickerId=nil;_pickerCallback=nil;_picker=nil;complete(callback,@{@"id":identifier,@"code":@"CANCELLED"});
}
- (void)readMaterialFile:(NSDictionary *)options callback:(UniModuleKeepAliveCallback)callback {[_files read:options completion:^(NSDictionary *value){complete(callback,value);}];}
- (void)releaseMaterialFile:(NSDictionary *)options {if([options isKindOfClass:NSDictionary.class])[_files releaseHandle:options[@"handle"]];}
- (void)cancelFileOperation:(NSDictionary *)options {
    NSString *identifier=[options isKindOfClass:NSDictionary.class]?options[@"id"]:nil;if(![identifier isKindOfClass:NSString.class])return;
    if([identifier isEqual:_pickerId]){UIDocumentPickerViewController *picker=_picker;UniModuleKeepAliveCallback callback=_pickerCallback;_pickerId=nil;_pickerCallback=nil;_picker=nil;picker.delegate=nil;if(picker.presentingViewController.presentedViewController==picker)[picker dismissViewControllerAnimated:YES completion:nil];complete(callback,@{@"id":identifier,@"code":@"CANCELLED"});}
    [_files cancel:identifier];
}
- (void)dealloc {[_transport close];[_files close];UIDocumentPickerViewController *picker=_picker;UniModuleKeepAliveCallback callback=_pickerCallback;NSString *identifier=_pickerId;dispatch_async(dispatch_get_main_queue(),^{picker.delegate=nil;if(picker.presentingViewController.presentedViewController==picker)[picker dismissViewControllerAnimated:NO completion:nil];if(callback)callback(@{@"id":identifier?:@"",@"code":@"CANCELLED"},NO);});}
@end
