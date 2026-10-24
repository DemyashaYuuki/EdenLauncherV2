package fun.edenworld.skinbridge.velocity;

import com.google.inject.Inject;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.PluginMessageEvent;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.plugin.Dependency;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import com.velocitypowered.api.proxy.ServerConnection;
import com.velocitypowered.api.proxy.messages.MinecraftChannelIdentifier;
import fun.edenworld.skinbridge.core.AuthAssertion;
import java.io.IOException;
import java.nio.file.Path;
import org.slf4j.Logger;

/**
 * Answers authentication queries from the EdenSkinBridge backend plugin for players connected
 * through this proxy. Client-originated messages on the channel are dropped; replies are signed
 * with the shared secret and carry the backend server name the query came from.
 */
@Plugin(
		id = "edenskinbridge",
		name = "EdenSkinBridge",
		version = "1.0.0",
		description = "Authentication assertions for the EdenLauncher skin bridge",
		authors = {"EdenWorld"},
		dependencies = {@Dependency(id = "veloauth", optional = true), @Dependency(id = "nlogin", optional = true)})
public final class EdenSkinBridgeVelocity {
	static final MinecraftChannelIdentifier CHANNEL = MinecraftChannelIdentifier.from(AuthAssertion.CHANNEL);

	private final ProxyServer proxy;
	private final Logger logger;
	private final Path dataDirectory;
	private CompanionConfig config;
	private ProxyAuthAdapter adapter;

	@Inject
	public EdenSkinBridgeVelocity(ProxyServer proxy, Logger logger, @DataDirectory Path dataDirectory) {
		this.proxy = proxy;
		this.logger = logger;
		this.dataDirectory = dataDirectory;
	}

	@Subscribe
	public void onProxyInitialize(ProxyInitializeEvent event) {
		try {
			config = CompanionConfig.load(dataDirectory);
		} catch (IOException e) {
			logger.error("Could not load EdenSkinBridge config; authentication queries will be denied", e);
			return;
		}
		adapter = chooseAdapter();
		proxy.getChannelRegistrar().register(CHANNEL);
		if (config.secret() == null) {
			logger.error("shared-secret is missing or shorter than 32 bytes; queries will be ignored");
		}
		String reason = adapter.unavailableReason();
		logger.info("EdenSkinBridge companion ready with adapter {}{}", adapter.name(), reason == null ? "" : " (not ready: " + reason + ")");
	}

	private ProxyAuthAdapter chooseAdapter() {
		boolean veloauth = proxy.getPluginManager().getPlugin("veloauth").isPresent();
		return switch (config.adapter()) {
			case "veloauth" -> new VeloAuthAdapter(proxy, config.veloAuthVersions(), logger);
			case "nlogin" -> new NLoginVelocityAdapter(proxy);
			default -> veloauth ? new VeloAuthAdapter(proxy, config.veloAuthVersions(), logger) : new NLoginVelocityAdapter(proxy);
		};
	}

	@Subscribe
	public void onPluginMessage(PluginMessageEvent event) {
		if (!event.getIdentifier().equals(CHANNEL)) {
			return;
		}
		event.setResult(PluginMessageEvent.ForwardResult.handled());
		if (!(event.getSource() instanceof ServerConnection server)) {
			return;
		}
		if (config == null || config.secret() == null || adapter == null) {
			return;
		}
		String serverName = server.getServerInfo().getName();
		if (!config.allowedServers().contains(serverName)) {
			logger.warn("Ignoring auth query from server {} (not in allowed-servers)", serverName);
			return;
		}
		AuthAssertion.Query query;
		try {
			query = AuthAssertion.decodeQuery(event.getData());
		} catch (AuthAssertion.InvalidAssertionException e) {
			return;
		}
		Player player = server.getPlayer();
		if (!player.getUniqueId().equals(query.player())) {
			return;
		}
		boolean authenticated = adapter.unavailableReason() == null && adapter.isAuthenticated(player);
		byte[] reply = AuthAssertion.encodeReply(
				new AuthAssertion.Reply(
						query.nonce(),
						player.getUniqueId(),
						player.getUsername(),
						serverName,
						authenticated,
						adapter.name(),
						System.currentTimeMillis()),
				config.secret());
		server.sendPluginMessage(CHANNEL, reply);
	}
}
