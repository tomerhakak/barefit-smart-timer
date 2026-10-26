package com.barefit.discovery;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import com.facebook.react.bridge.*;
import java.net.Inet4Address;
import java.util.*;

/** Bounded, foreground-only Android NSD scan. No subnet probes or timer access. */
public class BareFitDiscoveryModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
  private final Handler main = new Handler(Looper.getMainLooper());
  private final NsdManager manager;
  private Promise pending;
  private NsdManager.DiscoveryListener discovery;
  private WifiManager.MulticastLock multicast;
  private int generation = 0;
  private final ArrayDeque<NsdServiceInfo> queue = new ArrayDeque<>();
  private final Set<String> seen = new HashSet<>();
  private final Map<String, String> results = new LinkedHashMap<>();
  private boolean resolving = false;
  private final Runnable timeout = () -> finish(null);

  public BareFitDiscoveryModule(ReactApplicationContext context) {
    super(context);
    manager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
    context.addLifecycleEventListener(this);
  }
  @Override public String getName() { return "BareFitDiscovery"; }

  @ReactMethod public void scan(Promise promise) {
    main.post(() -> {
      if (pending != null) { promise.reject("BUSY", "Discovery already running"); return; }
      if (manager == null) { promise.reject("UNAVAILABLE", "Network discovery unavailable"); return; }
      pending = promise;
      int scan = ++generation;
      queue.clear(); seen.clear(); results.clear(); resolving = false;
      discovery = new NsdManager.DiscoveryListener() {
        public void onDiscoveryStarted(String type) {}
        public void onDiscoveryStopped(String type) {}
        public void onStopDiscoveryFailed(String type, int code) {}
        public void onStartDiscoveryFailed(String type, int code) {
          main.post(() -> { if (generation == scan) finish("Network discovery could not start"); });
        }
        public void onServiceLost(NsdServiceInfo service) {
          main.post(() -> { if (generation == scan) results.remove(service.getServiceName()); });
        }
        public void onServiceFound(NsdServiceInfo service) {
          main.post(() -> {
            if (generation != scan || pending == null || seen.size() >= 16) return;
            if (!service.getServiceType().startsWith("_barefit._tcp")) return;
            if (seen.add(service.getServiceName())) { queue.add(service); resolveNext(scan); }
          });
        }
      };
      try {
        WifiManager wifi = (WifiManager) getReactApplicationContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
          multicast = wifi.createMulticastLock("barefit-discovery");
          multicast.setReferenceCounted(false);
          multicast.acquire();
        }
        main.postDelayed(timeout, 8000);
        manager.discoverServices("_barefit._tcp.", NsdManager.PROTOCOL_DNS_SD, discovery);
      } catch (Exception e) { finish("Network discovery unavailable"); }
    });
  }

  @SuppressWarnings("deprecation")
  private void resolveNext(int scan) {
    if (generation != scan || pending == null || resolving || queue.isEmpty()) return;
    NsdServiceInfo service = queue.remove();
    resolving = true;
    try {
      manager.resolveService(service, new NsdManager.ResolveListener() {
        public void onResolveFailed(NsdServiceInfo info, int code) {
          main.post(() -> { if (generation == scan) { resolving = false; resolveNext(scan); } });
        }
        public void onServiceResolved(NsdServiceInfo info) {
          main.post(() -> {
            if (generation != scan || pending == null) return;
            if (info.getHost() instanceof Inet4Address && info.getPort() > 0 && info.getPort() <= 65535) {
              results.put(info.getServiceName(), "http://" + info.getHost().getHostAddress() + ":" + info.getPort());
            }
            resolving = false; resolveNext(scan);
          });
        }
      });
    } catch (Exception e) { resolving = false; resolveNext(scan); }
  }

  private void finish(String error) {
    if (pending == null) return;
    ++generation;
    main.removeCallbacks(timeout);
    if (discovery != null) {
      try { manager.stopServiceDiscovery(discovery); } catch (Exception ignored) {}
      discovery = null;
    }
    if (multicast != null) {
      try { if (multicast.isHeld()) multicast.release(); } catch (Exception ignored) {}
      multicast = null;
    }
    WritableArray found = Arguments.createArray();
    for (String url : results.values()) {
      WritableMap row = Arguments.createMap(); row.putString("url", url); found.pushMap(row);
    }
    Promise done = pending; pending = null;
    queue.clear(); results.clear(); seen.clear(); resolving = false;
    if (error == null) done.resolve(found); else done.reject("DISCOVERY", error);
  }
  @Override public void onHostResume() {}
  @Override public void onHostPause() { main.post(() -> finish(null)); }
  @Override public void onHostDestroy() { main.post(() -> finish(null)); }
  @Override public void invalidate() {
    getReactApplicationContext().removeLifecycleEventListener(this);
    main.post(() -> finish(null));
    super.invalidate();
  }
}
