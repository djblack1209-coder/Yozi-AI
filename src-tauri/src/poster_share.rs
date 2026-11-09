use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{
    define_class, msg_send, AllocAnyThread, DefinedClass, MainThreadMarker, MainThreadOnly, Message,
};
use objc2_app_kit::{
    NSSharingService, NSSharingServiceDelegate, NSSharingServicePicker,
    NSSharingServicePickerDelegate, NSView,
};
use objc2_foundation::{
    NSArray, NSData, NSError, NSPoint, NSRect, NSRectEdge, NSSize, NSUserCancelledError,
};
use std::cell::RefCell;
use tauri::async_runtime::{channel, Sender};
use tauri::WebviewWindow;

type ShareResult = Result<bool, String>;

struct ShareRequest {
    _picker: Retained<NSSharingServicePicker>,
    _delegate: Retained<PosterShareDelegate>,
}

thread_local! {
    // AppKit keeps a weak delegate. Retain one open picker until its terminal callback.
    static SHARE_REQUEST: RefCell<Option<ShareRequest>> = const { RefCell::new(None) };
}

define_class!(
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[ivars = RefCell<Option<Sender<ShareResult>>>]
    struct PosterShareDelegate;

    unsafe impl NSObjectProtocol for PosterShareDelegate {}

    unsafe impl NSSharingServicePickerDelegate for PosterShareDelegate {
        #[unsafe(method_id(sharingServicePicker:delegateForSharingService:))]
        fn service_delegate(
            &self,
            _: &NSSharingServicePicker,
            _: &NSSharingService,
        ) -> Option<Retained<ProtocolObject<dyn NSSharingServiceDelegate>>> {
            Some(ProtocolObject::from_retained(self.retain()))
        }

        #[unsafe(method(sharingServicePicker:didChooseSharingService:))]
        fn chosen(&self, _: &NSSharingServicePicker, service: Option<&NSSharingService>) {
            if service.is_none() {
                self.finish(Ok(false));
            }
        }
    }

    unsafe impl NSSharingServiceDelegate for PosterShareDelegate {
        #[unsafe(method(sharingService:didShareItems:))]
        unsafe fn shared(&self, _: &NSSharingService, _: &NSArray) {
            self.finish(Ok(true));
        }

        #[unsafe(method(sharingService:didFailToShareItems:error:))]
        unsafe fn failed(&self, _: &NSSharingService, _: &NSArray, error: &NSError) {
            let result = if error.code() == NSUserCancelledError {
                Ok(false)
            } else {
                Err("系统分享未完成".into())
            };
            self.finish(result);
        }
    }
);

impl PosterShareDelegate {
    fn finish(&self, result: ShareResult) {
        let sender = self.ivars().borrow_mut().take();
        if let Some(sender) = sender {
            let _request = SHARE_REQUEST.with(|request| request.borrow_mut().take());
            let _ = sender.try_send(result);
        }
    }
}

pub async fn share(window: WebviewWindow, png: Vec<u8>) -> ShareResult {
    let (sender, mut receiver) = channel(1);
    window
        .with_webview(move |platform| {
            let Some(main_thread) = MainThreadMarker::new() else {
                let _ = sender.try_send(Err("无法打开系统分享".into()));
                return;
            };
            if SHARE_REQUEST.with(|request| request.borrow().is_some()) {
                let _ = sender.try_send(Err("请先关闭当前系统分享窗口".into()));
                return;
            }
            let data = NSData::from_vec(png);
            let Some(image) =
                objc2_app_kit::NSImage::initWithData(objc2_app_kit::NSImage::alloc(), &data)
            else {
                let _ = sender.try_send(Err("图片数据无效".into()));
                return;
            };
            let items = NSArray::<AnyObject>::from_slice(&[&*image]);
            // The validated PNG is the only item. AppKit receives no file path.
            let picker = unsafe {
                NSSharingServicePicker::initWithItems(NSSharingServicePicker::alloc(), &items)
            };
            let delegate =
                PosterShareDelegate::alloc(main_thread).set_ivars(RefCell::new(Some(sender)));
            let delegate: Retained<PosterShareDelegate> =
                unsafe { msg_send![super(delegate), init] };
            picker.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            SHARE_REQUEST.with(|request| {
                *request.borrow_mut() = Some(ShareRequest {
                    _picker: picker.clone(),
                    _delegate: delegate,
                });
            });
            // Tauri runs with_webview on the main thread and provides a live WKWebView (an NSView).
            let view = unsafe { &*platform.inner().cast::<NSView>() };
            let bounds = view.bounds();
            let anchor = NSRect::new(
                NSPoint::new(bounds.size.width / 2.0, bounds.size.height / 2.0),
                NSSize::new(1.0, 1.0),
            );
            picker.showRelativeToRect_ofView_preferredEdge(anchor, view, NSRectEdge::MinY);
        })
        .map_err(|_| "无法打开系统分享")?;
    receiver
        .recv()
        .await
        .unwrap_or_else(|| Err("系统分享未完成".into()))
}
