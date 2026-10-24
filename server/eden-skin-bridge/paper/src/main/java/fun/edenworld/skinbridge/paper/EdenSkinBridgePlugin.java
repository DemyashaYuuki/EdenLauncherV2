package fun.edenworld.skinbridge.paper;

import fun.edenworld.skinbridge.core.AuthAssertion;
import fun.edenworld.skinbridge.core.AuthGate;
import fun.edenworld.skinbridge.core.HttpApi;
import fun.edenworld.skinbridge.core.JobService;
import fun.edenworld.skinbridge.core.PairingService;
import fun.edenworld.skinbridge.core.PlayerRef;
import fun.edenworld.skinbridge.core.ProxyAuthVerifier;
import fun.edenworld.skinbridge.core.RateLimiter;
import fun.edenworld.skinbridge.core.TokenStore;
import java.io.File;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;
import org.bukkit.command.PluginCommand;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;

/** EdenSkinBridge for Purpur/Paper backends. */
public final class EdenSkinBridgePlugin extends JavaPlugin implements Listener {
	private HttpApi api;
	private JobService jobs;
	private PairingService pairing;

	@Override
	public void onEnable() {
		saveDefaultConfig();
		FileConfiguration config = getConfig();
		Clock clock = Clock.systemUTC();

		pairing = new PairingService(clock, Duration.ofSeconds(Math.max(60, Math.min(900, config.getInt("pairing.code-ttl-seconds", 300)))), 256);
		TokenStore tokens;
		try {
			tokens = new TokenStore(
					new File(getDataFolder(), "links.json").toPath(),
					clock,
					Math.max(1, Math.min(10, config.getInt("tokens.max-per-player", 5))),
					Duration.ofDays(Math.max(1, Math.min(3650, config.getInt("tokens.idle-expiry-days", 180)))));
		} catch (IOException e) {
			getLogger().log(Level.SEVERE, "Could not read links.json; the bridge stays disabled", e);
			getServer().getPluginManager().disablePlugin(this);
			return;
		}

		AuthGate auth = createAuthGate(config, clock);
		SkinsRestorerBackend backend = new SkinsRestorerBackend(this, readLooks(config));
		jobs = new JobService(backend, clock, getLogger(), 2, 64);

		RateLimiter commandAttempts = new RateLimiter(6, 60_000, 4096, clock);
		PluginCommand command = getCommand("edenstudio");
		if (command != null) {
			EdenStudioCommand executor = new EdenStudioCommand(this, auth, pairing, tokens, backend, commandAttempts);
			command.setExecutor(executor);
			command.setTabCompleter(executor);
		}
		getServer().getPluginManager().registerEvents(this, this);

		String host = config.getString("http.host", "127.0.0.1");
		int port = config.getInt("http.port", 8787);
		List<String> trusted = config.getStringList("http.trusted-proxies");
		api = new HttpApi(
				new HttpApi.Settings(host, port, trusted, 1024 * 1024),
				pairing,
				tokens,
				jobs,
				backend,
				auth,
				clock,
				getLogger(),
				getPluginMeta().getVersion(),
				Math.max(1, Math.min(60, config.getInt("skins.max-requests-per-hour", 10))));
		try {
			api.start();
			getLogger().info("Skin bridge API listening on " + host + ":" + api.boundPort() + " (auth: " + auth.adapterName() + ")");
		} catch (IOException e) {
			getLogger().log(Level.SEVERE, "Could not bind the skin bridge API on " + host + ":" + port, e);
		}
		AuthGate.Readiness ready = auth.readiness();
		if (!ready.ready()) {
			getLogger().warning("Linking is disabled until auth is ready: " + ready.detail());
		}
		AuthGate.Readiness skins = backend.readiness();
		if (!skins.ready()) {
			getLogger().warning("Skin application is disabled: " + skins.detail());
		}
	}

	private AuthGate createAuthGate(FileConfiguration config, Clock clock) {
		String adapter = config.getString("auth.adapter", "auto").toLowerCase(java.util.Locale.ROOT);
		boolean nloginPresent = getServer().getPluginManager().getPlugin("nLogin") != null;
		if (adapter.equals("nlogin") || (adapter.equals("auto") && nloginPresent)) {
			NLoginGate gate = new NLoginGate(this);
			if (nloginPresent) {
				getServer().getPluginManager().registerEvents(gate, this);
			}
			return gate;
		}
		ForwardingCheck.Result forwarding = ForwardingCheck.inspect(
				getServer().getPluginsFolder().getAbsoluteFile().getParentFile(),
				getServer().getOnlineMode(),
				config.getBoolean("auth.require-velocity-forwarding", true));
		ProxyAuthVerifier verifier = new ProxyAuthVerifier(
				AuthAssertion.parseSecret(config.getString("proxy.shared-secret", "")),
				config.getString("proxy.server-name", ""),
				clock,
				Duration.ofSeconds(5),
				getLogger());
		ProxyAssertionGate gate = new ProxyAssertionGate(this, verifier, forwarding);
		getServer().getMessenger().registerOutgoingPluginChannel(this, AuthAssertion.CHANNEL);
		getServer().getMessenger().registerIncomingPluginChannel(this, AuthAssertion.CHANNEL, gate);
		return gate;
	}

	private List<SkinsRestorerBackend.LookConfig> readLooks(FileConfiguration config) {
		List<SkinsRestorerBackend.LookConfig> looks = new ArrayList<>();
		for (Map<?, ?> entry : config.getMapList("looks")) {
			Object id = entry.get("id");
			Object label = entry.get("label");
			Object skin = entry.get("skin");
			if (id instanceof String i && i.matches("[A-Za-z0-9_-]{1,64}") && skin instanceof String s && !s.isBlank()) {
				looks.add(new SkinsRestorerBackend.LookConfig(i, label instanceof String l ? l : i, s));
			}
			if (looks.size() >= 64) {
				break;
			}
		}
		return looks;
	}

	@EventHandler
	public void onQuit(PlayerQuitEvent event) {
		if (pairing != null) {
			pairing.releasePlayer(new PlayerRef(event.getPlayer().getUniqueId(), event.getPlayer().getName()));
		}
	}

	@Override
	public void onDisable() {
		if (api != null) {
			api.close();
		}
		if (jobs != null) {
			jobs.close();
		}
		getServer().getMessenger().unregisterIncomingPluginChannel(this);
		getServer().getMessenger().unregisterOutgoingPluginChannel(this);
	}
}
