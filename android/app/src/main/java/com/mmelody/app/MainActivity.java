package com.mmelody.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.view.KeyEvent;
import android.bluetooth.BluetoothDevice;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    private BroadcastReceiver hardwareAudioReceiver;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        hardwareAudioReceiver = new BroadcastReceiver() {
            @Override
                public void onReceive(Context context, Intent intent) {
                    String action = intent.getAction();
                    AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                    
                    // ACQUIRE WAKE LOCK: Forces the CPU to stay awake during the resume event
                    android.os.PowerManager powerManager = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
                    android.os.PowerManager.WakeLock wakeLock = powerManager.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "mMelody:ResumeLock");
                    wakeLock.acquire(3000); // Keep CPU awake for 3 seconds to process the resume

                    if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(action)) {
                        // PAUSE
                        audioManager.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PAUSE));
                        audioManager.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PAUSE));
                        
                        runOnUiThread(() -> {
                            if (bridge != null && bridge.getWebView() != null) {
                                bridge.getWebView().evaluateJavascript("window.dispatchEvent(new Event('magnetic-disconnect'));", null);
                            }
                            if (wakeLock.isHeld()) wakeLock.release();
                        });

                    } else if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(action) || Intent.ACTION_HEADSET_PLUG.equals(action)) {
                        // RESUME
                        new android.os.Handler().postDelayed(() -> {
                            // 1. Force System Play
                            Intent i = new Intent(Intent.ACTION_MEDIA_BUTTON);
                            KeyEvent eventDown = new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY);
                            i.putExtra(Intent.EXTRA_KEY_EVENT, eventDown);
                            context.sendOrderedBroadcast(i, null);
                            
                            KeyEvent eventUp = new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY);
                            i.putExtra(Intent.EXTRA_KEY_EVENT, eventUp);
                            context.sendOrderedBroadcast(i, null);
                            
                            // 2. Wake WebView
                            runOnUiThread(() -> {
                                if (bridge != null && bridge.getWebView() != null) {
                                    bridge.getWebView().evaluateJavascript("if (window.forcePlay) { window.forcePlay(); }", null);
                                }
                                if (wakeLock.isHeld()) wakeLock.release();
                            });
                        }, 1500); 
                    }
                }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        filter.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        filter.addAction(Intent.ACTION_HEADSET_PLUG); // Added to catch buds detected as headsets
        registerReceiver(hardwareAudioReceiver, filter);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (hardwareAudioReceiver != null) {
            try { unregisterReceiver(hardwareAudioReceiver); } catch(Exception e) {}
        }
    }
}