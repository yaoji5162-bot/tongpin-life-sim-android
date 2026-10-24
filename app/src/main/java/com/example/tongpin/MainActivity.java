package com.example.tongpin;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private static final int IMPORT_FILE = 40, EXPORT_FILE = 41;
    private WebView web;
    private ValueCallback<Uri[]> fileChooser;
    private String exportJson;
    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private final ConcurrentHashMap<String, HttpURLConnection> requests = new ConcurrentHashMap<>();
    private final Object saveLock = new Object();
    private AtomicFile primary, backup;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        primary = new AtomicFile(new File(getFilesDir(), "aevum-save-v1.json"));
        backup = new AtomicFile(new File(getFilesDir(), "aevum-save-previous.json"));
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.addJavascriptInterface(new NativeBridge(), "AevumNative");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme()) && "/android_asset/index.html".equals(u.getPath())) return false;
                if ("https".equals(u.getScheme()) || "http".equals(u.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooser != null) fileChooser.onReceiveValue(null);
                fileChooser = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(intent, IMPORT_FILE);
                    return true;
                } catch (Exception e) { fileChooser = null; return false; }
            }
        });
        setContentView(web);
        // Keep this URL and package unchanged: old WebView local data retains its origin.
        web.loadUrl("file:///android_asset/index.html");
    }
    private String read(AtomicFile file) throws IOException {
        try (InputStream in = file.openRead()) { return new String(readBytes(in, 40 * 1024 * 1024), StandardCharsets.UTF_8); }
    }
    private void write(AtomicFile file, String text) throws IOException {
        FileOutputStream out = null;
        try { out = file.startWrite(); out.write(text.getBytes(StandardCharsets.UTF_8)); file.finishWrite(out); }
        catch (IOException e) { if (out != null) file.failWrite(out); throw e; }
    }
    private static byte[] readBytes(InputStream in, int limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) != -1) { if (out.size() + n > limit) throw new IOException("Response too large"); out.write(buf, 0, n); }
        return out.toByteArray();
    }
    private void js(String code) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); }); }
    public final class NativeBridge {
        @JavascriptInterface public String loadSave() {
            synchronized (saveLock) {
                try { return read(primary); } catch (IOException missing) { return ""; }
            }
        }
        @JavascriptInterface public String loadBackup() {
            synchronized (saveLock) { try { return read(backup); } catch (IOException e) { return ""; } }
        }
        @JavascriptInterface public boolean saveGame(String text) {
            synchronized (saveLock) {
                try {
                    JSONObject json = new JSONObject(text);
                    if (!"aevum".equals(json.optString("format")) || json.optInt("schemaVersion") != 1) return false;
                    if (primary.getBaseFile().exists()) {
                        String previous = read(primary);
                        // Never destroy a valid backup with an unreadable/invalid primary.
                        try { JSONObject old = new JSONObject(previous); if ("aevum".equals(old.optString("format")) && old.optInt("schemaVersion") >= 1) write(backup, previous); } catch (org.json.JSONException ignored) { }
                    }
                    write(primary, text); return true;
                } catch (Exception e) { return false; }
            }
        }
        @JavascriptInterface public void request(String id, String method, String address, String headers, String body) {
            executor.execute(() -> {
                HttpURLConnection c = null;
                try {
                    URL url = new URL(address);
                    if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null) throw new IOException("Only HTTPS API URLs are supported");
                    if (!"GET".equals(method) && !"POST".equals(method)) throw new IOException("Unsupported method");
                    c = (HttpURLConnection) url.openConnection(); requests.put(id, c);
                    c.setInstanceFollowRedirects(false); c.setConnectTimeout(20000); c.setReadTimeout(120000); c.setRequestMethod(method);
                    JSONObject h = new JSONObject(headers);
                    for (Iterator<String> it = h.keys(); it.hasNext();) { String key = it.next(); if (key.equalsIgnoreCase("Authorization") || key.equalsIgnoreCase("Content-Type")) c.setRequestProperty(key, h.getString(key)); }
                    if ("POST".equals(method)) { c.setDoOutput(true); try (OutputStream out = c.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); } }
                    int status = c.getResponseCode(); InputStream stream = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    String response = stream == null ? "" : new String(readBytes(stream, 32 * 1024 * 1024), StandardCharsets.UTF_8);
                    if (stream != null) stream.close();
                    js("window.__aevumResponse(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(response) + ",null)");
                } catch (Exception e) {
                    js("window.__aevumResponse(" + JSONObject.quote(id) + ",0,\"\",\"网络请求失败，请检查网络与渠道地址\")");
                } finally { requests.remove(id); if (c != null) c.disconnect(); }
            });
        }
        @JavascriptInterface public void cacheImage(String id, String address) {
            executor.execute(() -> {
                HttpURLConnection c = null;
                try {
                    URL url = new URL(address);
                    if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null) throw new IOException();
                    c = (HttpURLConnection) url.openConnection(); c.setInstanceFollowRedirects(false); c.setConnectTimeout(15000); c.setReadTimeout(20000);
                    if (c.getResponseCode() != 200) throw new IOException();
                    String mime = c.getContentType(); if (mime == null || !mime.startsWith("image/")) throw new IOException();
                    mime = mime.split(";")[0];
                    if (!mime.equals("image/png") && !mime.equals("image/jpeg") && !mime.equals("image/webp") && !mime.equals("image/gif")) throw new IOException();
                    byte[] bytes; try (InputStream in = c.getInputStream()) { bytes = readBytes(in, 20 * 1024 * 1024); }
                    String data = "data:" + mime + ";base64," + android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);
                    js("window.__aevumImage(" + JSONObject.quote(id) + "," + JSONObject.quote(data) + ",null)");
                } catch (Exception e) { js("window.__aevumImage(" + JSONObject.quote(id) + ",null,\"立绘下载备份失败，暂保留原链接\")"); }
                finally { if (c != null) c.disconnect(); }
            });
        }
        @JavascriptInterface public void cancelRequest(String id) { HttpURLConnection c = requests.remove(id); if (c != null) c.disconnect(); }
        @JavascriptInterface public void exportSave(String text) {
            runOnUiThread(() -> {
                exportJson = text;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE, "aevum-save.json");
                try { startActivityForResult(intent, EXPORT_FILE); } catch (Exception e) { exportJson = null; js("window.__aevumExportResult(false)"); }
            });
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == IMPORT_FILE && fileChooser != null) { fileChooser.onReceiveValue(result == RESULT_OK && data != null ? new Uri[]{data.getData()} : null); fileChooser = null; }
        if (request == EXPORT_FILE) {
            String text = exportJson; exportJson = null;
            if (result != RESULT_OK || data == null || text == null) return;
            executor.execute(() -> { try (OutputStream out = getContentResolver().openOutputStream(data.getData())) { if (out == null) throw new IOException(); out.write(text.getBytes(StandardCharsets.UTF_8)); js("window.__aevumExportResult(true)"); } catch (Exception e) { js("window.__aevumExportResult(false)"); } });
        }
    }
    @Override public void onBackPressed() {
        if (web != null) web.evaluateJavascript("window.__aevumBack ? window.__aevumBack() : 'exit'", result -> { if ("\"exit\"".equals(result)) MainActivity.super.onBackPressed(); });
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        for (HttpURLConnection c : requests.values()) c.disconnect(); executor.shutdownNow();
        if (fileChooser != null) fileChooser.onReceiveValue(null);
        if (web != null) { web.removeJavascriptInterface("AevumNative"); web.destroy(); web = null; }
        super.onDestroy();
    }
}
