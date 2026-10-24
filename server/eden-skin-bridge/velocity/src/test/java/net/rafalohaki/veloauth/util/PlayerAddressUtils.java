package net.rafalohaki.veloauth.util;

import com.velocitypowered.api.proxy.Player;

public final class PlayerAddressUtils {
	private PlayerAddressUtils() {}

	public static String getPlayerIp(Player player) {
		return player.getRemoteAddress() == null ? "unknown" : player.getRemoteAddress().getAddress().getHostAddress();
	}
}
