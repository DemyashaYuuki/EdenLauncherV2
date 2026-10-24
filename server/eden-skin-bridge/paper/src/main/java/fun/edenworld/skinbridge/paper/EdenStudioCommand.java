package fun.edenworld.skinbridge.paper;

import fun.edenworld.skinbridge.core.AuthGate;
import fun.edenworld.skinbridge.core.PairingService;
import fun.edenworld.skinbridge.core.PlayerRef;
import fun.edenworld.skinbridge.core.RateLimiter;
import fun.edenworld.skinbridge.core.SkinBackend;
import fun.edenworld.skinbridge.core.TokenStore;
import java.util.List;
import java.util.Map;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

/**
 * {@code /edenstudio link <code>} binds a pending launcher pairing to the authenticated player and
 * asks for an explicit confirmation; {@code confirm}/{@code deny} answer it; {@code unlink} revokes
 * every launcher link of the player.
 */
final class EdenStudioCommand implements CommandExecutor, TabCompleter {
	private static final Map<String, String> REASONS = Map.of(
			"not_authenticated", "Сначала войди в аккаунт сервера.",
			"two_factor_pending", "Заверши двухфакторную проверку входа.",
			"offline", "Игрок не в сети.",
			"identity_changed", "Сессия изменилась. Перезайди на сервер.",
			"proxy_timeout", "Прокси не подтвердил вход. Попробуй ещё раз.",
			"proxy_not_configured", "Привязка временно недоступна: сервер не настроен.",
			"nlogin_unavailable", "Привязка временно недоступна: система входа не готова.");

	private final Plugin plugin;
	private final AuthGate auth;
	private final PairingService pairing;
	private final TokenStore tokens;
	private final SkinBackend backend;
	private final RateLimiter attempts;

	EdenStudioCommand(
			Plugin plugin, AuthGate auth, PairingService pairing, TokenStore tokens, SkinBackend backend, RateLimiter attempts) {
		this.plugin = plugin;
		this.auth = auth;
		this.pairing = pairing;
		this.tokens = tokens;
		this.backend = backend;
		this.attempts = attempts;
	}

	private static Component info(String text) {
		return Component.text(text, NamedTextColor.GRAY);
	}

	private static Component error(String text) {
		return Component.text(text, NamedTextColor.RED);
	}

	private static String reason(AuthGate.AuthDecision decision) {
		String key = decision.reason() == null ? "" : decision.reason().split(":")[0];
		return REASONS.getOrDefault(key, "Не удалось подтвердить вход. Попробуй ещё раз.");
	}

	private void runVerified(Player player, java.util.function.Consumer<PlayerRef> action) {
		PlayerRef ref = new PlayerRef(player.getUniqueId(), player.getName());
		auth.verify(ref).whenComplete((decision, failure) -> Bukkit.getScheduler().runTask(plugin, () -> {
			Player current = Bukkit.getPlayer(ref.uuid());
			if (current == null || !current.isOnline()) {
				return;
			}
			if (failure != null || decision == null || !decision.authenticated()) {
				current.sendMessage(error(reason(decision == null ? AuthGate.AuthDecision.denied("error") : decision)));
				return;
			}
			action.accept(ref);
		}));
	}

	@Override
	public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
		if (args.length >= 1 && args[0].equalsIgnoreCase("status") && sender.hasPermission("edenstudio.admin")) {
			AuthGate.Readiness authReady = auth.readiness();
			AuthGate.Readiness skins = backend.readiness();
			sender.sendMessage(info("Auth (" + auth.adapterName() + "): " + (authReady.ready() ? "OK" : authReady.detail())));
			sender.sendMessage(info("SkinsRestorer: " + (skins.ready() ? "OK" : skins.detail())));
			sender.sendMessage(info("Pairings in memory: " + pairing.size()));
			return true;
		}
		if (!(sender instanceof Player player)) {
			sender.sendMessage(error("Команда доступна только игрокам."));
			return true;
		}
		if (args.length == 0) {
			player.sendMessage(info("Мастерская скинов EdenLauncher: /edenstudio link <код>, /edenstudio unlink"));
			return true;
		}
		String sub = args[0].toLowerCase(java.util.Locale.ROOT);
		if (!attempts.tryAcquire(player.getUniqueId() + ":" + sub)) {
			player.sendMessage(error("Слишком много попыток. Подожди минуту."));
			return true;
		}
		switch (sub) {
			case "link" -> {
				if (args.length < 2) {
					player.sendMessage(error("Укажи код из лаунчера: /edenstudio link <код>"));
					return true;
				}
				String code = String.join("", java.util.Arrays.copyOfRange(args, 1, args.length));
				runVerified(player, ref -> claim(player, ref, code));
			}
			case "confirm" -> {
				if (args.length != 2) {
					return true;
				}
				runVerified(player, ref -> {
					try {
						pairing.confirmInGame(args[1], ref);
						player.sendMessage(Component.text(
								"Готово! Вернись в лаунчер и подтверди, что это твой игрок.", NamedTextColor.GREEN));
					} catch (PairingService.PairingException e) {
						player.sendMessage(error(e.code().equals("expired")
								? "Код истёк. Получи новый в лаунчере."
								: "Запрос не найден. Получи новый код в лаунчере."));
					}
				});
			}
			case "deny" -> {
				if (args.length != 2) {
					return true;
				}
				try {
					pairing.rejectInGame(args[1], new PlayerRef(player.getUniqueId(), player.getName()));
					player.sendMessage(info("Привязка отклонена."));
				} catch (PairingService.PairingException e) {
					player.sendMessage(error("Запрос не найден."));
				}
			}
			case "unlink" -> {
				int removed = tokens.revokeAll(player.getUniqueId());
				player.sendMessage(info(removed > 0 ? "Все привязки лаунчера удалены: " + removed + "." : "Привязок нет."));
			}
			default -> player.sendMessage(error("Неизвестная команда. /edenstudio link <код> или /edenstudio unlink"));
		}
		return true;
	}

	private void claim(Player player, PlayerRef ref, String code) {
		try {
			String nonce = pairing.claim(code, ref);
			Component confirm = Component.text("[Подтвердить]", NamedTextColor.GREEN)
					.clickEvent(ClickEvent.runCommand("/edenstudio confirm " + nonce))
					.hoverEvent(HoverEvent.showText(Component.text("Привязать лаунчер к " + ref.name())));
			Component deny = Component.text("[Отклонить]", NamedTextColor.RED)
					.clickEvent(ClickEvent.runCommand("/edenstudio deny " + nonce));
			player.sendMessage(Component.text("Привязать мастерскую скинов EdenLauncher к игроку ", NamedTextColor.WHITE)
					.append(Component.text(ref.name(), NamedTextColor.AQUA))
					.append(Component.text(" (" + ref.uuid() + ")? ", NamedTextColor.GRAY)));
			player.sendMessage(confirm.append(Component.text("  ")).append(deny));
		} catch (PairingService.PairingException e) {
			player.sendMessage(error(switch (e.code()) {
				case "expired" -> "Код истёк. Получи новый в лаунчере.";
				case "already_claimed_by_you" -> "Этот код уже ждёт подтверждения в чате.";
				default -> "Код не найден. Проверь его в лаунчере.";
			}));
		}
	}

	@Override
	public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
		if (args.length == 1) {
			return List.of("link", "unlink").stream().filter(s -> s.startsWith(args[0].toLowerCase(java.util.Locale.ROOT))).toList();
		}
		return List.of();
	}
}
