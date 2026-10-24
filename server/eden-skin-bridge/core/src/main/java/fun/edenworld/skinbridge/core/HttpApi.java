package fun.edenworld.skinbridge.core;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Pattern;

/**
 * JSON HTTP API used by EdenLauncher. Binds to loopback by default; operators publish it through a
 * TLS reverse proxy. All player operations require a bearer token from a completed pairing and act
 * only on the player the token is bound to.
 */
public final class HttpApi implements AutoCloseable {
	public record Settings(String host, int port, List<String> trustedProxies, int maxBodyBytes) {}

	private static final Pattern ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");
	private static final Pattern KEY = Pattern.compile("[A-Za-z0-9_-]{8,64}");
	private static final String SERVICE = "eden-skin-bridge";

	private final Settings settings;
	private final PairingService pairing;
	private final TokenStore tokens;
	private final JobService jobs;
	private final SkinBackend backend;
	private final AuthGate auth;
	private final Logger logger;
	private final String version;
	private final RateLimiter startLimit;
	private final RateLimiter pollLimit;
	private final RateLimiter finalizeLimit;
	private final RateLimiter bearerLimit;
	private final RateLimiter applyLimit;
	private HttpServer server;
	private ThreadPoolExecutor executor;

	public HttpApi(
			Settings settings,
			PairingService pairing,
			TokenStore tokens,
			JobService jobs,
			SkinBackend backend,
			AuthGate auth,
			Clock clock,
			Logger logger,
			String version,
			int appliesPerHour) {
		this.settings = settings;
		this.pairing = pairing;
		this.tokens = tokens;
		this.jobs = jobs;
		this.backend = backend;
		this.auth = auth;
		this.logger = logger;
		this.version = version;
		this.startLimit = new RateLimiter(6, 60_000, 4096, clock);
		this.pollLimit = new RateLimiter(120, 60_000, 4096, clock);
		this.finalizeLimit = new RateLimiter(12, 60_000, 4096, clock);
		this.bearerLimit = new RateLimiter(120, 60_000, 4096, clock);
		this.applyLimit = new RateLimiter(appliesPerHour, 3_600_000, 4096, clock);
	}

	public void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress(InetAddress.getByName(settings.host()), settings.port()), 32);
		executor = new ThreadPoolExecutor(2, 4, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(64), runnable -> {
			Thread thread = new Thread(runnable, "EdenSkinBridge-http");
			thread.setDaemon(true);
			return thread;
		});
		server.setExecutor(executor);
		server.createContext("/", this::handle);
		server.start();
	}

	public int boundPort() {
		return server.getAddress().getPort();
	}

	@Override
	public void close() {
		if (server != null) {
			server.stop(0);
		}
		if (executor != null) {
			executor.shutdownNow();
		}
	}

	private static final class ApiError extends Exception {
		private static final long serialVersionUID = 1L;
		final int status;
		final String code;

		ApiError(int status, String code, String message) {
			super(message);
			this.status = status;
			this.code = code;
		}
	}

	private String clientAddress(HttpExchange exchange) {
		InetAddress remote = exchange.getRemoteAddress().getAddress();
		String address = remote.getHostAddress();
		if (!settings.trustedProxies().contains(address)) {
			return address;
		}
		String forwarded = exchange.getRequestHeaders().getFirst("X-Forwarded-For");
		if (forwarded == null || forwarded.length() > 512) {
			return address;
		}
		String[] hops = forwarded.split(",");
		String last = hops[hops.length - 1].trim();
		return last.matches("[0-9a-fA-F:.]{2,45}") ? last : address;
	}

	private void handle(HttpExchange exchange) throws IOException {
		try (exchange) {
			try {
				route(exchange);
			} catch (ApiError e) {
				send(exchange, e.status, error(e.code, e.getMessage()));
			} catch (RuntimeException e) {
				logger.log(Level.WARNING, "Bridge request failed", e);
				send(exchange, 500, error("internal", "Internal error"));
			}
		}
	}

	private void route(HttpExchange exchange) throws IOException, ApiError {
		String method = exchange.getRequestMethod().toUpperCase(Locale.ROOT);
		String path = exchange.getRequestURI().getPath();
		if (exchange.getRequestURI().getRawQuery() != null) {
			throw new ApiError(400, "bad_request", "Query strings are not accepted");
		}
		String ip = clientAddress(exchange);
		switch (path) {
			case "/v1/health" -> {
				requireMethod(method, "GET");
				send(exchange, 200, health());
			}
			case "/v1/pair/start" -> {
				requireMethod(method, "POST");
				limit(startLimit, ip);
				readJson(exchange);
				try {
					PairingService.Start start = pairing.start();
					JsonObject out = new JsonObject();
					out.addProperty("pairing_id", start.pairingId());
					out.addProperty("code", PairingService.displayCode(start.code()));
					out.addProperty("poll_secret", start.pollSecret());
					out.addProperty("expires_in", start.expiresInSeconds());
					out.addProperty("command", "/edenstudio link " + start.code());
					send(exchange, 200, out);
				} catch (PairingService.PairingException e) {
					throw new ApiError(503, e.code(), "Too many pairings in progress");
				}
			}
			case "/v1/pair/status" -> {
				requireMethod(method, "POST");
				limit(pollLimit, ip);
				JsonObject body = readJson(exchange);
				try {
					PairingService.View view = pairing.status(string(body, "pairing_id"), string(body, "poll_secret"));
					JsonObject out = new JsonObject();
					out.addProperty("status", wireState(view.state()));
					out.addProperty("expires_in", view.expiresInSeconds());
					if (view.player() != null) {
						out.add("player", player(view.player()));
					}
					send(exchange, 200, out);
				} catch (PairingService.PairingException e) {
					throw new ApiError(404, e.code(), "Unknown pairing");
				}
			}
			case "/v1/pair/finalize" -> {
				requireMethod(method, "POST");
				limit(finalizeLimit, ip);
				JsonObject body = readJson(exchange);
				try {
					PlayerRef player = pairing.finalizeLaunch(string(body, "pairing_id"), string(body, "poll_secret"));
					TokenStore.Issued issued = tokens.issue(player);
					JsonObject out = new JsonObject();
					out.addProperty("token", issued.token());
					out.add("player", player(player));
					send(exchange, 200, out);
				} catch (PairingService.PairingException e) {
					throw new ApiError(409, e.code(), "The pairing is not confirmed");
				}
			}
			case "/v1/pair/cancel" -> {
				requireMethod(method, "POST");
				limit(pollLimit, ip);
				JsonObject body = readJson(exchange);
				try {
					pairing.cancel(string(body, "pairing_id"), string(body, "poll_secret"));
				} catch (PairingService.PairingException e) {
					throw new ApiError(404, e.code(), "Unknown pairing");
				}
				send(exchange, 200, new JsonObject());
			}
			case "/v1/link" -> {
				limit(bearerLimit, ip);
				String token = bearer(exchange);
				TokenStore.Link link = authenticate(token);
				if (method.equals("DELETE")) {
					tokens.revoke(token);
					send(exchange, 200, new JsonObject());
				} else {
					requireMethod(method, "GET");
					JsonObject out = new JsonObject();
					out.add("player", player(new PlayerRef(link.player(), link.name())));
					out.addProperty("created_ms", link.createdMs());
					send(exchange, 200, out);
				}
			}
			case "/v1/skin" -> {
				requireMethod(method, "POST");
				limit(bearerLimit, ip);
				TokenStore.Link link = authenticate(bearer(exchange));
				JsonObject body = readJson(exchange);
				String variant = string(body, "variant");
				if (!variant.equals("classic") && !variant.equals("slim")) {
					throw new ApiError(400, "bad_variant", "Variant must be classic or slim");
				}
				String key = string(body, "idempotency_key");
				if (!KEY.matcher(key).matches()) {
					throw new ApiError(400, "bad_request", "Invalid idempotency key");
				}
				byte[] png;
				try {
					png = SkinPng.sanitize(SkinPng.decodeBase64(string(body, "png_base64")));
				} catch (SkinPng.InvalidSkinException e) {
					throw new ApiError(400, "invalid_skin:" + e.getMessage(), "The skin must be a 64×64 or 64×32 PNG");
				}
				if (!applyLimit.tryAcquire(link.player().toString())) {
					throw new ApiError(429, "rate_limited", "Too many skin changes, try again later");
				}
				requireReady();
				try {
					send(exchange, 202, job(jobs.submitSkin(link.player(), key, png, variant)));
				} catch (JobService.QueueFullException e) {
					throw new ApiError(503, "busy", "The server is busy, try again later");
				}
			}
			case "/v1/looks" -> {
				requireMethod(method, "GET");
				limit(bearerLimit, ip);
				authenticate(bearer(exchange));
				JsonArray array = new JsonArray();
				for (SkinBackend.Look look : backend.looks()) {
					JsonObject item = new JsonObject();
					item.addProperty("id", look.id());
					item.addProperty("label", look.label());
					item.addProperty("has_cape", look.hasCape());
					array.add(item);
				}
				JsonObject out = new JsonObject();
				out.add("looks", array);
				send(exchange, 200, out);
			}
			default -> routeDynamic(exchange, method, path, ip);
		}
	}

	private void routeDynamic(HttpExchange exchange, String method, String path, String ip) throws IOException, ApiError {
		String[] parts = path.split("/");
		if (parts.length == 4 && parts[1].equals("v1") && parts[2].equals("jobs")) {
			requireMethod(method, "GET");
			limit(bearerLimit, ip);
			TokenStore.Link link = authenticate(bearer(exchange));
			String id = id(parts[3]);
			send(exchange, 200, job(jobs.get(id, link.player()).orElseThrow(() -> notFound())));
			return;
		}
		if (parts.length == 5 && parts[1].equals("v1") && parts[2].equals("jobs") && parts[4].equals("cancel")) {
			requireMethod(method, "POST");
			limit(bearerLimit, ip);
			TokenStore.Link link = authenticate(bearer(exchange));
			send(exchange, 200, job(jobs.cancel(id(parts[3]), link.player()).orElseThrow(() -> notFound())));
			return;
		}
		if (parts.length == 5 && parts[1].equals("v1") && parts[2].equals("looks") && parts[4].equals("apply")) {
			requireMethod(method, "POST");
			limit(bearerLimit, ip);
			TokenStore.Link link = authenticate(bearer(exchange));
			String lookId = id(parts[3]);
			JsonObject body = readJson(exchange);
			String key = string(body, "idempotency_key");
			if (!KEY.matcher(key).matches()) {
				throw new ApiError(400, "bad_request", "Invalid idempotency key");
			}
			if (backend.looks().stream().noneMatch(look -> look.id().equals(lookId))) {
				throw notFound();
			}
			if (!applyLimit.tryAcquire(link.player().toString())) {
				throw new ApiError(429, "rate_limited", "Too many skin changes, try again later");
			}
			requireReady();
			try {
				send(exchange, 202, job(jobs.submitLook(link.player(), key, lookId)));
			} catch (JobService.QueueFullException e) {
				throw new ApiError(503, "busy", "The server is busy, try again later");
			}
			return;
		}
		throw notFound();
	}

	private void requireReady() throws ApiError {
		AuthGate.Readiness skins = backend.readiness();
		if (!skins.ready()) {
			throw new ApiError(503, "skins_unavailable", skins.detail() == null ? "Skins are unavailable" : skins.detail());
		}
	}

	private static ApiError notFound() {
		return new ApiError(404, "not_found", "Not found");
	}

	private static String id(String raw) throws ApiError {
		if (!ID.matcher(raw).matches()) {
			throw notFound();
		}
		return raw;
	}

	private static void requireMethod(String actual, String expected) throws ApiError {
		if (!actual.equals(expected)) {
			throw new ApiError(405, "method_not_allowed", "Method not allowed");
		}
	}

	private static void limit(RateLimiter limiter, String key) throws ApiError {
		if (!limiter.tryAcquire(key)) {
			throw new ApiError(429, "rate_limited", "Too many requests");
		}
	}

	private static String bearer(HttpExchange exchange) throws ApiError {
		String header = exchange.getRequestHeaders().getFirst("Authorization");
		if (header == null || !header.startsWith("Bearer ")) {
			throw new ApiError(401, "unauthorized", "Missing token");
		}
		return header.substring("Bearer ".length()).trim();
	}

	private TokenStore.Link authenticate(String token) throws ApiError {
		return tokens.authenticate(token).orElseThrow(() -> new ApiError(401, "unauthorized", "Unknown or revoked token"));
	}

	private JsonObject readJson(HttpExchange exchange) throws IOException, ApiError {
		String type = exchange.getRequestHeaders().getFirst("Content-Type");
		InputStream in = exchange.getRequestBody();
		byte[] bytes = in.readNBytes(settings.maxBodyBytes() + 1);
		if (bytes.length > settings.maxBodyBytes()) {
			throw new ApiError(413, "too_large", "Request body is too large");
		}
		if (bytes.length == 0) {
			return new JsonObject();
		}
		if (type == null || !type.toLowerCase(Locale.ROOT).startsWith("application/json")) {
			throw new ApiError(415, "unsupported_media_type", "JSON body expected");
		}
		try {
			JsonElement element = JsonParser.parseString(new String(bytes, StandardCharsets.UTF_8));
			if (!element.isJsonObject()) {
				throw new ApiError(400, "bad_request", "JSON object expected");
			}
			return element.getAsJsonObject();
		} catch (JsonParseException | IllegalStateException e) {
			throw new ApiError(400, "bad_request", "Invalid JSON");
		}
	}

	private static String string(JsonObject body, String field) throws ApiError {
		JsonElement value = body.get(field);
		if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) {
			throw new ApiError(400, "bad_request", "Missing field " + field);
		}
		return value.getAsString();
	}

	private static JsonObject player(PlayerRef player) {
		JsonObject out = new JsonObject();
		out.addProperty("uuid", player.uuid().toString());
		out.addProperty("name", player.name());
		return out;
	}

	private static String wireState(PairingService.State state) {
		return switch (state) {
			case PENDING, CLAIMED -> "pending";
			case AWAITING_LAUNCHER -> "awaiting_launcher";
			case CONFIRMED -> "confirmed";
			case EXPIRED -> "expired";
			case REJECTED -> "rejected";
			case CANCELLED -> "cancelled";
		};
	}

	private static JsonObject job(JobService.Job job) {
		JsonObject out = new JsonObject();
		out.addProperty("job_id", job.id());
		out.addProperty("status", job.status().name().toLowerCase(Locale.ROOT));
		if (job.message() != null) {
			out.addProperty("message", job.message());
		}
		if (job.errorCode() != null) {
			out.addProperty("error_code", job.errorCode());
		}
		return out;
	}

	private JsonObject health() {
		AuthGate.Readiness authReady = auth.readiness();
		AuthGate.Readiness skins = backend.readiness();
		JsonObject out = new JsonObject();
		out.addProperty("service", SERVICE);
		out.addProperty("version", version);
		JsonObject authJson = new JsonObject();
		authJson.addProperty("adapter", auth.adapterName());
		authJson.addProperty("ready", authReady.ready());
		if (authReady.detail() != null) {
			authJson.addProperty("detail", authReady.detail());
		}
		out.add("auth", authJson);
		JsonObject skinsJson = new JsonObject();
		skinsJson.addProperty("ready", skins.ready());
		if (skins.detail() != null) {
			skinsJson.addProperty("detail", skins.detail());
		}
		out.add("skins", skinsJson);
		JsonObject generator = new JsonObject();
		generator.addProperty("ready", skins.ready());
		generator.addProperty("detail", "MineSkin through SkinsRestorer; generation can be queued by the service");
		out.add("generator", generator);
		out.addProperty("looks", backend.looks().size());
		return out;
	}

	private static JsonObject error(String code, String message) {
		JsonObject out = new JsonObject();
		out.addProperty("error", code);
		out.addProperty("message", message);
		return out;
	}

	private static void send(HttpExchange exchange, int status, JsonObject body) throws IOException {
		byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
		exchange.getResponseHeaders().set("Cache-Control", "no-store");
		exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
		exchange.sendResponseHeaders(status, bytes.length);
		try (OutputStream out = exchange.getResponseBody()) {
			out.write(bytes);
		}
	}
}
