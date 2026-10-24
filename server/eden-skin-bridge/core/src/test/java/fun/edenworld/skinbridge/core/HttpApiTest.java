package fun.edenworld.skinbridge.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.logging.Logger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class HttpApiTest {
	private static final class FakeBackend implements SkinBackend {
		final List<UUID> applied = new CopyOnWriteArrayList<>();
		volatile boolean ready = true;
		volatile boolean fail;

		@Override
		public AuthGate.Readiness readiness() {
			return ready ? AuthGate.Readiness.ok() : AuthGate.Readiness.notReady("SkinsRestorer API unavailable");
		}

		@Override
		public SignedTexture generate(byte[] png, String variant) throws BackendException {
			if (fail) {
				throw new BackendException("generator", "MineSkin rate limit");
			}
			return new SignedTexture("value", "signature");
		}

		@Override
		public ApplyResult apply(UUID player, SignedTexture texture) {
			applied.add(player);
			return ApplyResult.APPLIED;
		}

		@Override
		public List<Look> looks() {
			return List.of(new Look("founder", "Founder", true));
		}

		@Override
		public ApplyResult applyLook(UUID player, String lookId) {
			applied.add(player);
			return ApplyResult.SAVED_OFFLINE;
		}
	}

	private static final class FakeAuth implements AuthGate {
		@Override
		public String adapterName() {
			return "test";
		}

		@Override
		public Readiness readiness() {
			return Readiness.ok();
		}

		@Override
		public CompletableFuture<AuthDecision> verify(PlayerRef player) {
			return CompletableFuture.completedFuture(AuthDecision.allowed());
		}
	}

	@TempDir
	Path dir;

	private final HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();
	private final FakeBackend backend = new FakeBackend();
	private final PlayerRef alice = new PlayerRef(UUID.randomUUID(), "Alice");
	private final PlayerRef bob = new PlayerRef(UUID.randomUUID(), "Bob");
	private PairingService pairing;
	private JobService jobs;
	private HttpApi api;
	private String base;

	@BeforeEach
	void start() throws Exception {
		Clock clock = Clock.systemUTC();
		pairing = new PairingService(clock, Duration.ofMinutes(5), 64);
		TokenStore tokens = new TokenStore(dir.resolve("links.json"), clock, 5, Duration.ofDays(180));
		jobs = new JobService(backend, clock, Logger.getLogger("test"), 1, 4);
		api = new HttpApi(
				new HttpApi.Settings("127.0.0.1", 0, List.of(), 1024 * 1024),
				pairing,
				tokens,
				jobs,
				backend,
				new FakeAuth(),
				clock,
				Logger.getLogger("test"),
				"1.0.0",
				20);
		api.start();
		base = "http://127.0.0.1:" + api.boundPort();
	}

	@AfterEach
	void stop() {
		api.close();
		jobs.close();
	}

	private HttpResponse<String> call(String method, String path, String token, JsonObject body) throws Exception {
		HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(10));
		if (token != null) {
			request.header("Authorization", "Bearer " + token);
		}
		if (body != null) {
			request.header("Content-Type", "application/json");
			request.method(method, HttpRequest.BodyPublishers.ofString(body.toString()));
		} else {
			request.method(method, HttpRequest.BodyPublishers.noBody());
		}
		return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
	}

	private static JsonObject json(HttpResponse<String> response) {
		return JsonParser.parseString(response.body()).getAsJsonObject();
	}

	private static JsonObject pairBody(JsonObject start) {
		JsonObject body = new JsonObject();
		body.addProperty("pairing_id", start.get("pairing_id").getAsString());
		body.addProperty("poll_secret", start.get("poll_secret").getAsString());
		return body;
	}

	private String link(PlayerRef player) throws Exception {
		JsonObject start = json(call("POST", "/v1/pair/start", null, new JsonObject()));
		String code = start.get("code").getAsString();
		assertEquals("pending", json(call("POST", "/v1/pair/status", null, pairBody(start))).get("status").getAsString());
		String nonce = pairing.claim(code, player);
		pairing.confirmInGame(nonce, player);
		JsonObject status = json(call("POST", "/v1/pair/status", null, pairBody(start)));
		assertEquals("awaiting_launcher", status.get("status").getAsString());
		assertEquals(player.uuid().toString(), status.getAsJsonObject("player").get("uuid").getAsString());
		HttpResponse<String> finalized = call("POST", "/v1/pair/finalize", null, pairBody(start));
		assertEquals(200, finalized.statusCode());
		assertEquals(409, call("POST", "/v1/pair/finalize", null, pairBody(start)).statusCode(), "single use");
		return json(finalized).get("token").getAsString();
	}

	private JsonObject skinRequest(String key) throws Exception {
		JsonObject body = new JsonObject();
		body.addProperty("variant", "classic");
		body.addProperty("idempotency_key", key);
		body.addProperty("png_base64", Base64.getEncoder().encodeToString(SecurityPrimitivesTest.png(64, 64)));
		return body;
	}

	private JsonObject waitForJob(String token, String id) throws Exception {
		for (int i = 0; i < 100; i++) {
			JsonObject job = json(call("GET", "/v1/jobs/" + id, token, null));
			String status = job.get("status").getAsString();
			if (!status.equals("queued") && !status.equals("generating") && !status.equals("applying")) {
				return job;
			}
			Thread.sleep(20);
		}
		throw new AssertionError("job did not finish");
	}

	@Test
	void healthReportsReadiness() throws Exception {
		JsonObject health = json(call("GET", "/v1/health", null, null));
		assertEquals("eden-skin-bridge", health.get("service").getAsString());
		assertTrue(health.getAsJsonObject("auth").get("ready").getAsBoolean());
		assertEquals(1, health.get("looks").getAsInt());
	}

	@Test
	void pairedLauncherAppliesOnlyToItsOwnPlayer() throws Exception {
		String aliceToken = link(alice);
		HttpResponse<String> submitted = call("POST", "/v1/skin", aliceToken, skinRequest("apply-00000001"));
		assertEquals(202, submitted.statusCode());
		String jobId = json(submitted).get("job_id").getAsString();
		assertEquals("applied", waitForJob(aliceToken, jobId).get("status").getAsString());
		assertEquals(List.of(alice.uuid()), backend.applied);

		HttpResponse<String> again = call("POST", "/v1/skin", aliceToken, skinRequest("apply-00000001"));
		assertEquals(jobId, json(again).get("job_id").getAsString(), "idempotent retry returns the same job");

		String bobToken = link(bob);
		assertEquals(404, call("GET", "/v1/jobs/" + jobId, bobToken, null).statusCode(), "jobs are private to their player");
		assertEquals(alice.uuid().toString(), json(call("GET", "/v1/link", aliceToken, null)).getAsJsonObject("player").get("uuid").getAsString());
	}

	@Test
	void rejectsMissingForgedAndRevokedTokens() throws Exception {
		assertEquals(401, call("POST", "/v1/skin", null, skinRequest("apply-00000002")).statusCode());
		assertEquals(401, call("POST", "/v1/skin", "x".repeat(43), skinRequest("apply-00000002")).statusCode());
		String token = link(alice);
		assertEquals(200, call("DELETE", "/v1/link", token, null).statusCode());
		assertEquals(401, call("GET", "/v1/link", token, null).statusCode());
	}

	@Test
	void validatesInputAndPaths() throws Exception {
		String token = link(alice);
		JsonObject badVariant = skinRequest("apply-00000003");
		badVariant.addProperty("variant", "dinnerbone");
		assertEquals(400, call("POST", "/v1/skin", token, badVariant).statusCode());
		JsonObject hd = skinRequest("apply-00000004");
		hd.addProperty("png_base64", Base64.getEncoder().encodeToString(SecurityPrimitivesTest.png(128, 128)));
		assertEquals(400, call("POST", "/v1/skin", token, hd).statusCode());
		JsonObject badKey = skinRequest("../../x");
		assertEquals(400, call("POST", "/v1/skin", token, badKey).statusCode());
		assertEquals(404, call("GET", "/v1/jobs/..%2F..%2Fetc", token, null).statusCode());
		assertEquals(400, call("GET", "/v1/health?x=1", null, null).statusCode());
		assertEquals(405, call("GET", "/v1/pair/start", null, null).statusCode());
		JsonObject huge = new JsonObject();
		huge.addProperty("pad", "x".repeat(2 * 1024 * 1024));
		assertEquals(413, call("POST", "/v1/pair/status", null, huge).statusCode());
		assertEquals(404, call("POST", "/v1/looks/unknown/apply", token, skinRequest("apply-00000005")).statusCode());
	}

	@Test
	void reportsGeneratorFailuresAndUnavailableSkins() throws Exception {
		String token = link(alice);
		backend.fail = true;
		JsonObject job = waitForJob(token, json(call("POST", "/v1/skin", token, skinRequest("apply-00000006"))).get("job_id").getAsString());
		assertEquals("failed", job.get("status").getAsString());
		assertEquals("generator", job.get("error_code").getAsString());
		backend.ready = false;
		assertEquals(503, call("POST", "/v1/skin", token, skinRequest("apply-00000007")).statusCode());
		assertFalse(json(call("GET", "/v1/health", null, null)).getAsJsonObject("skins").get("ready").getAsBoolean());
	}

	@Test
	void looksApplyThroughJobs() throws Exception {
		String token = link(alice);
		assertEquals("founder", json(call("GET", "/v1/looks", token, null)).getAsJsonArray("looks").get(0).getAsJsonObject().get("id").getAsString());
		JsonObject body = new JsonObject();
		body.addProperty("idempotency_key", "look-00000001");
		HttpResponse<String> response = call("POST", "/v1/looks/founder/apply", token, body);
		assertEquals(202, response.statusCode());
		assertEquals("saved_offline", waitForJob(token, json(response).get("job_id").getAsString()).get("status").getAsString());
	}

	@Test
	void rateLimitsPairingStarts() throws Exception {
		int limited = 0;
		for (int i = 0; i < 8; i++) {
			if (call("POST", "/v1/pair/start", null, new JsonObject()).statusCode() == 429) {
				limited++;
			}
		}
		assertEquals(2, limited);
	}
}
