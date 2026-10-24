package net.rafalohaki.veloauth;

import net.rafalohaki.veloauth.auth.totp.PendingTotpStore;
import net.rafalohaki.veloauth.cache.AuthCache;

/**
 * Test double with the same public method signatures as VeloAuth 1.6.2-offline.2 (checked against
 * the real JAR by RealVeloAuthContractTest when the JAR is available).
 */
public class VeloAuth {
	public boolean initialized = true;
	public final AuthCache cache = new AuthCache();
	public final PendingTotpStore pending = new PendingTotpStore();

	public boolean isInitialized() {
		return initialized;
	}

	public AuthCache getAuthCache() {
		return cache;
	}

	public PendingTotpStore getPendingTotpStore() {
		return pending;
	}
}
