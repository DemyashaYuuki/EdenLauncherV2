package fun.edenworld.skinbridge.paper;

import java.io.File;
import org.bukkit.configuration.file.YamlConfiguration;

/**
 * Checks that this backend only accepts players through Velocity modern forwarding, so the UUID a
 * player has here is the one the proxy authenticated rather than one chosen by the client.
 */
final class ForwardingCheck {
	record Result(boolean trusted, String detail) {}

	private ForwardingCheck() {}

	static Result inspect(File serverRoot, boolean serverOnlineMode, boolean required) {
		if (!required) {
			return new Result(true, "forwarding check disabled by auth.require-velocity-forwarding: false");
		}
		File global = new File(new File(serverRoot, "config"), "paper-global.yml");
		if (!global.isFile()) {
			return new Result(false, "config/paper-global.yml not found; Velocity modern forwarding cannot be verified");
		}
		YamlConfiguration yaml = YamlConfiguration.loadConfiguration(global);
		if (!yaml.getBoolean("proxies.velocity.enabled", false)) {
			return new Result(false, "Velocity modern forwarding is disabled (proxies.velocity.enabled)");
		}
		String secret = yaml.getString("proxies.velocity.secret", "");
		if (secret == null || secret.isBlank()) {
			return new Result(false, "Velocity forwarding secret is empty");
		}
		if (serverOnlineMode) {
			return new Result(false, "online-mode must be false behind Velocity");
		}
		return new Result(true, null);
	}
}
