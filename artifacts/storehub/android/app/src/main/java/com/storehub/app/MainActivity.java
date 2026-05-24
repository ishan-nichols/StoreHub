package com.storehub.app;

import android.app.ActivityManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Kiosk mode: set KIOSK_PIN in build config or leave empty to disable kiosk.
    // When non-empty the app locks itself to the screen (Android Task Locking / Screen Pinning).
    private static final String KIOSK_PIN = BuildConfig.KIOSK_PIN;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen on for POS hardware deployments
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (isKioskEnabled()) {
            enableKioskMode();
        }
    }

    private boolean isKioskEnabled() {
        return KIOSK_PIN != null && !KIOSK_PIN.isEmpty();
    }

    private void enableKioskMode() {
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (am != null && am.isDeviceOwnerApp(getPackageName())) {
            // Device owner: use full lock task mode (true kiosk — no status bar, no back)
            String[] packages = { getPackageName() };
            am.setLockTaskPackages(packages);
            startLockTask();
        } else {
            // Fallback: use screen pinning (user can unpin with Back+Recents, but POS staff won't)
            startLockTask();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && isKioskEnabled()) {
            // Re-enter lock task if focus returns (e.g. after a dialog)
            startLockTask();
        }
    }

    // Block hardware Back button in kiosk mode
    @Override
    public void onBackPressed() {
        if (isKioskEnabled()) {
            return;
        }
        super.onBackPressed();
    }

    // Block Home, Recents, and Volume keys in kiosk mode
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (isKioskEnabled()) {
            if (keyCode == KeyEvent.KEYCODE_HOME
                    || keyCode == KeyEvent.KEYCODE_APP_SWITCH
                    || keyCode == KeyEvent.KEYCODE_VOLUME_UP
                    || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }
}
