package cn.yozi.connector;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import com.alibaba.fastjson.JSONObject;
import io.dcloud.feature.uniapp.annotation.UniJSMethod;
import io.dcloud.feature.uniapp.bridge.UniJSCallback;
import io.dcloud.feature.uniapp.common.UniDestroyableModule;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/** SDK入口只暴露固定合同，不暴露任意反射或代码执行。 */
public final class YoziConnectorModule extends UniDestroyableModule {
    private final ConnectorTransport transport = new ConnectorTransport();
    private final MaterialFiles files=new MaterialFiles();
    private final AndroidPosterShare posterShare = new AndroidPosterShare();
    private static final int PICK_DOCUMENT=0x57E1;
    private String pickerId;
    private UniJSCallback pickerCallback;
    private boolean destroyed;
    @UniJSMethod(uiThread=false) public JSONObject getCapabilities(){Map<String,Object> caps=ConnectorTransport.capabilities();caps.put("file",MaterialFiles.capabilities());return new JSONObject(caps);}
    @UniJSMethod(uiThread=false) public void request(JSONObject options, UniJSCallback callback){if(callback!=null)transport.request(options,callback::invoke);}
    @UniJSMethod(uiThread=false) public void stream(JSONObject options, UniJSCallback callback){
        if(callback==null)return;
        transport.stream(options,value->{Map<String,Object> envelope=new HashMap<>(value);Object chunk=envelope.remove("chunk");if(chunk instanceof byte[])envelope.put("data",android.util.Base64.encodeToString((byte[])chunk,android.util.Base64.NO_WRAP));String kind=(String)envelope.get("kind");if("headers".equals(kind) || "chunk".equals(kind))callback.invokeAndKeepAlive(envelope);else callback.invoke(envelope);});
    }
    @UniJSMethod(uiThread=false) public void cancel(String id){transport.cancel(id);}
    private void fail(UniJSCallback callback,String id,String code){if(callback!=null){Map<String,Object> r=new HashMap<>();r.put("id",id==null?"":id);r.put("code",code);callback.invoke(r);}}
    @UniJSMethod(uiThread=true) public void chooseMaterialFile(JSONObject options,UniJSCallback callback){
        String id=options==null?null:options.getString("id");
        if(id==null || !id.matches("[A-Za-z0-9_-]{1,128}")){fail(callback,"","INVALID_REQUEST");return;}
        if(destroyed || pickerId!=null || !(mUniSDKInstance.getContext() instanceof Activity)){fail(callback,id,destroyed?"CANCELLED":"BUSY");return;}
        pickerId=id;pickerCallback=callback;
        try{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/pdf","image/png","image/jpeg"});intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,false);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);((Activity)mUniSDKInstance.getContext()).startActivityForResult(intent,PICK_DOCUMENT);}
        catch(Exception error){pickerId=null;pickerCallback=null;fail(callback,id,"FILE_READ_FAILED");}
    }
    @Override public void onActivityResult(int requestCode,int resultCode,Intent data){
        if (requestCode == AndroidPosterShare.REQUEST_CODE) {
            posterShare.returned();
            return;
        }
        if(requestCode!=PICK_DOCUMENT || pickerId==null)return;
        String id=pickerId;UniJSCallback callback=pickerCallback;pickerId=null;pickerCallback=null;
        if(callback==null || destroyed)return;
        if(resultCode!=Activity.RESULT_OK || data==null || data.getData()==null){fail(callback,id,"CANCELLED");return;}
        try{files.select(id,new AndroidMaterialSource(mUniSDKInstance.getContext().getContentResolver(),data.getData()),callback::invoke);}catch(Exception error){fail(callback,id,"FILE_READ_FAILED");}
    }
    @UniJSMethod(uiThread=false) public void readMaterialFile(JSONObject options,UniJSCallback callback){if(callback==null)return;if(options==null){fail(callback,"","INVALID_REQUEST");return;}files.read(options.getString("id"),options.getString("handle"),Boolean.TRUE.equals(options.get("consent")),callback::invoke);}
    @UniJSMethod(uiThread=false) public void releaseMaterialFile(JSONObject options){if(options!=null)files.release(options.getString("handle"));}
    @UniJSMethod(uiThread=true) public void cancelFileOperation(JSONObject options){String id=options==null?null:options.getString("id");if(id==null)return;if(id.equals(pickerId)){UniJSCallback callback=pickerCallback;pickerCallback=null;fail(callback,id,"CANCELLED");}files.cancel(id);}
    @UniJSMethod(uiThread=false) public boolean canShareStudyPoster() {
        return AndroidPosterShare.supported();
    }
    @UniJSMethod(uiThread=true) public void shareStudyPoster(String base64, UniJSCallback callback) {
        if (callback == null) return;
        Context context = mUniSDKInstance.getContext();
        Activity activity = !destroyed && context instanceof Activity ? (Activity) context : null;
        posterShare.open(activity, base64, status -> callback.invoke(Collections.singletonMap("status", status)));
    }
    @Override public void destroy(){destroyed=true;posterShare.dispose();transport.close();files.close();if(pickerCallback!=null)fail(pickerCallback,pickerId,"CANCELLED");pickerCallback=null;}
}
