package fun.edenworld.skinbridge.paper;

import fun.edenworld.skinbridge.core.AuthGate;
import fun.edenworld.skinbridge.core.SecureTokens;
import fun.edenworld.skinbridge.core.SkinBackend;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import net.skinsrestorer.api.SkinsRestorer;
import net.skinsrestorer.api.SkinsRestorerProvider;
import net.skinsrestorer.api.connections.model.MineSkinResponse;
import net.skinsrestorer.api.exception.DataRequestException;
import net.skinsrestorer.api.exception.MineSkinException;
import net.skinsrestorer.api.property.SkinIdentifier;
import net.skinsrestorer.api.property.SkinProperty;
import net.skinsrestorer.api.property.SkinVariant;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

/**
 * Skin generation and storage through the public SkinsRestorer 15 API. A PNG is turned into a
 * signed property by SkinsRestorer's MineSkin integration (using the operator's MineSkin settings),
 * stored as a per-player custom skin, selected for the player and applied live on the main thread.
 */
final class SkinsRestorerBackend implements SkinBackend {
	record LookConfig(String id, String label, String skin) {}

	private final Plugin plugin;
	private final List<LookConfig> looks;

	SkinsRestorerBackend(Plugin plugin, List<LookConfig> looks) {
		this.plugin = plugin;
		this.looks = List.copyOf(looks);
	}

	private Optional<SkinsRestorer> api() {
		Plugin sr = Bukkit.getPluginManager().getPlugin("SkinsRestorer");
		if (sr == null || !sr.isEnabled()) {
			return Optional.empty();
		}
		try {
			return Optional.of(SkinsRestorerProvider.get());
		} catch (IllegalStateException e) {
			return Optional.empty();
		}
	}

	@Override
	public AuthGate.Readiness readiness() {
		Plugin sr = Bukkit.getPluginManager().getPlugin("SkinsRestorer");
		if (sr == null || !sr.isEnabled()) {
			return AuthGate.Readiness.notReady("SkinsRestorer is not installed or not enabled");
		}
		Optional<SkinsRestorer> api = api();
		if (api.isEmpty()) {
			return AuthGate.Readiness.notReady(
					"SkinsRestorer API is unavailable on this backend; on a Velocity network enable "
							+ "server.proxyMode.api and use the same MySQL/PostgreSQL storage as the proxy");
		}
		String version = api.get().getVersion();
		if (version == null || !version.startsWith("15.")) {
			return AuthGate.Readiness.notReady("Unsupported SkinsRestorer version " + version + " (15.x required)");
		}
		return AuthGate.Readiness.ok();
	}

	private SkinsRestorer requireApi() throws BackendException {
		return api().orElseThrow(() -> new BackendException("skins_unavailable", "SkinsRestorer API unavailable"));
	}

	static String storageName(UUID player) {
		String hash = SecureTokens.sha256Hex("eden-skin-bridge:" + player);
		return "eden" + hash.substring(0, 12);
	}

	@Override
	public SignedTexture generate(byte[] png, String variant) throws BackendException {
		SkinsRestorer api = requireApi();
		try {
			MineSkinResponse response = api.getMineSkinAPI()
					.genSkin(png, "slim".equals(variant) ? SkinVariant.SLIM : SkinVariant.CLASSIC);
			SkinProperty property = response.getProperty();
			if (property == null || property.getSignature() == null || property.getSignature().isEmpty()) {
				throw new BackendException("generator", "The generator returned an unsigned texture");
			}
			return new SignedTexture(property.getValue(), property.getSignature());
		} catch (MineSkinException e) {
			throw new BackendException("generator", sanitize(e.getMessage()), e);
		} catch (DataRequestException e) {
			throw new BackendException("generator_unavailable", sanitize(e.getMessage()), e);
		}
	}

	private static String sanitize(String message) {
		if (message == null) {
			return "Generation failed";
		}
		String clean = message.replaceAll("[\\p{Cntrl}]", " ");
		return clean.length() > 200 ? clean.substring(0, 200) : clean;
	}

	private ApplyResult applyLive(SkinsRestorer api, UUID uuid, SkinProperty property) throws BackendException {
		Future<Boolean> task = Bukkit.getScheduler().callSyncMethod(plugin, () -> {
			Player player = Bukkit.getPlayer(uuid);
			if (player == null || !player.isOnline()) {
				return false;
			}
			api.getSkinApplier(Player.class).applySkin(player, property);
			return true;
		});
		try {
			return task.get(15, TimeUnit.SECONDS) ? ApplyResult.APPLIED : ApplyResult.SAVED_OFFLINE;
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new BackendException("interrupted", "Interrupted while applying");
		} catch (ExecutionException | TimeoutException e) {
			return ApplyResult.SAVED_OFFLINE;
		}
	}

	@Override
	public ApplyResult apply(UUID player, SignedTexture texture) throws BackendException {
		SkinsRestorer api = requireApi();
		SkinProperty property = SkinProperty.of(texture.value(), texture.signature());
		String name = storageName(player);
		api.getSkinStorage().setCustomSkinData(name, property);
		api.getPlayerStorage().setSkinIdOfPlayer(player, SkinIdentifier.ofCustom(name));
		return applyLive(api, player, property);
	}

	static boolean hasCape(SkinProperty property) {
		try {
			String json = new String(Base64.getDecoder().decode(property.getValue()), StandardCharsets.UTF_8);
			return json.contains("\"CAPE\"");
		} catch (IllegalArgumentException e) {
			return false;
		}
	}

	@Override
	public List<Look> looks() {
		Optional<SkinsRestorer> api = api();
		return looks.stream()
				.map(look -> new Look(
						look.id(),
						look.label(),
						api.flatMap(a -> a.getSkinStorage().getSkinDataByIdentifier(SkinIdentifier.ofCustom(look.skin())))
								.map(SkinsRestorerBackend::hasCape)
								.orElse(false)))
				.toList();
	}

	@Override
	public ApplyResult applyLook(UUID player, String lookId) throws BackendException {
		SkinsRestorer api = requireApi();
		LookConfig look = looks.stream()
				.filter(l -> l.id().equals(lookId))
				.findFirst()
				.orElseThrow(() -> new BackendException("look_missing", "Unknown look"));
		SkinIdentifier identifier = SkinIdentifier.ofCustom(look.skin());
		SkinProperty property = api.getSkinStorage()
				.getSkinDataByIdentifier(identifier)
				.orElseThrow(() -> new BackendException("look_missing", "The look is not stored in SkinsRestorer"));
		api.getPlayerStorage().setSkinIdOfPlayer(player, identifier);
		return applyLive(api, player, property);
	}
}
