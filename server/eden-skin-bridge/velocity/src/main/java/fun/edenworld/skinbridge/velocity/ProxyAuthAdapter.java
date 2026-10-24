package fun.edenworld.skinbridge.velocity;

import com.velocitypowered.api.proxy.Player;

/** Decides on the proxy whether a connected player has fully completed authentication. */
interface ProxyAuthAdapter {
	String name();

	/** Null when ready, otherwise a reason the adapter cannot answer (and therefore denies). */
	String unavailableReason();

	boolean isAuthenticated(Player player);
}
