package fun.edenworld.skinbridge.core;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Logger;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SecurityPrimitivesTest {
	private final MutableClock clock = new MutableClock(Instant.parse("2026-10-24T12:00:00Z"));
	private final byte[] secret = SecureTokens.randomBytes(32);
	private final PlayerRef alice = new PlayerRef(UUID.randomUUID(), "Alice");

	static byte[] png(int width, int height) throws Exception {
		BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
		image.setRGB(1, 1, 0x80ff0000);
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(image, "png", out);
		return out.toByteArray();
	}

	@Test
	void tokensAreStoredOnlyAsHashes(@TempDir Path dir) throws Exception {
		Path file = dir.resolve("links.json");
		TokenStore store = new TokenStore(file, clock, 2, Duration.ofDays(30));
		TokenStore.Issued issued = store.issue(alice);
		String content = Files.readString(file, StandardCharsets.UTF_8);
		assertFalse(content.contains(issued.token()));
		assertTrue(content.contains(SecureTokens.sha256Hex(issued.token())));
		assertEquals(alice.uuid(), store.authenticate(issued.token()).orElseThrow().player());
		assertTrue(store.authenticate(issued.token() + "x").isEmpty());
		assertTrue(store.authenticate("short").isEmpty());

		TokenStore reloaded = new TokenStore(file, clock, 2, Duration.ofDays(30));
		assertTrue(reloaded.authenticate(issued.token()).isPresent());
	}

	@Test
	void tokensCanBeRevokedAndExpire(@TempDir Path dir) throws Exception {
		TokenStore store = new TokenStore(dir.resolve("links.json"), clock, 2, Duration.ofDays(30));
		TokenStore.Issued first = store.issue(alice);
		clock.advance(Duration.ofSeconds(1));
		TokenStore.Issued second = store.issue(alice);
		clock.advance(Duration.ofSeconds(1));
		TokenStore.Issued third = store.issue(alice);
		assertTrue(store.authenticate(first.token()).isEmpty(), "oldest link dropped beyond the per-player limit");
		assertTrue(store.revoke(second.token()));
		assertTrue(store.authenticate(second.token()).isEmpty());
		clock.advance(Duration.ofDays(31));
		assertTrue(store.authenticate(third.token()).isEmpty(), "idle links expire");
		TokenStore.Issued fresh = store.issue(alice);
		assertEquals(1, store.revokeAll(alice.uuid()));
		assertTrue(store.authenticate(fresh.token()).isEmpty());
	}

	@Test
	void signedRepliesVerify() throws Exception {
		byte[] nonce = SecureTokens.randomBytes(16);
		AuthAssertion.Reply reply = new AuthAssertion.Reply(nonce, alice.uuid(), "Alice", "main", true, "veloauth", clock.millis());
		byte[] message = AuthAssertion.encodeReply(reply, secret);
		AuthAssertion.Reply decoded = AuthAssertion.decodeReply(message, secret, clock);
		assertArrayEquals(nonce, decoded.nonce());
		assertTrue(decoded.authenticated());

		byte[] tampered = message.clone();
		tampered[40] ^= 1;
		assertThrows(AuthAssertion.InvalidAssertionException.class, () -> AuthAssertion.decodeReply(tampered, secret, clock));
		assertThrows(
				AuthAssertion.InvalidAssertionException.class,
				() -> AuthAssertion.decodeReply(message, SecureTokens.randomBytes(32), clock));
		clock.advance(Duration.ofSeconds(31));
		assertThrows(AuthAssertion.InvalidAssertionException.class, () -> AuthAssertion.decodeReply(message, secret, clock));
		assertThrows(AuthAssertion.InvalidAssertionException.class, () -> AuthAssertion.decodeReply(new byte[10], secret, clock));
	}

	@Test
	void secretsMustBeLongEnough() {
		assertNull(AuthAssertion.parseSecret(""));
		assertNull(AuthAssertion.parseSecret(Base64.getEncoder().encodeToString(new byte[16])));
		assertNull(AuthAssertion.parseSecret("not base64 !!"));
		assertEquals(32, AuthAssertion.parseSecret(Base64.getEncoder().encodeToString(new byte[32])).length);
	}

	private ProxyAuthVerifier verifier() {
		return new ProxyAuthVerifier(secret, "main", clock, Duration.ofMillis(300), Logger.getLogger("test"));
	}

	private byte[] answer(byte[] query, UUID player, String server, boolean authenticated) throws Exception {
		AuthAssertion.Query q = AuthAssertion.decodeQuery(query);
		return AuthAssertion.encodeReply(
				new AuthAssertion.Reply(q.nonce(), player, "Alice", server, authenticated, "veloauth", clock.millis()), secret);
	}

	@Test
	void proxyRepliesMustMatchNoncePlayerAndServer() throws Exception {
		ProxyAuthVerifier verifier = verifier();
		AtomicReference<byte[]> sent = new AtomicReference<>();

		CompletableFuture<AuthGate.AuthDecision> ok = verifier.request(alice, sent::set);
		byte[] reply = answer(sent.get(), alice.uuid(), "main", true);
		verifier.onReply(alice, reply);
		assertTrue(ok.get().authenticated());

		CompletableFuture<AuthGate.AuthDecision> replayed = verifier.request(alice, sent::set);
		verifier.onReply(alice, reply);
		assertFalse(replayed.get().authenticated(), "a reply cannot be reused for a new query");

		CompletableFuture<AuthGate.AuthDecision> forgedUuid = verifier.request(alice, sent::set);
		verifier.onReply(alice, answer(sent.get(), UUID.randomUUID(), "main", true));
		assertEquals("identity_mismatch", forgedUuid.get().reason());

		CompletableFuture<AuthGate.AuthDecision> otherServer = verifier.request(alice, sent::set);
		verifier.onReply(alice, answer(sent.get(), alice.uuid(), "lobby", true));
		assertEquals("wrong_server", otherServer.get().reason());

		CompletableFuture<AuthGate.AuthDecision> notLoggedIn = verifier.request(alice, sent::set);
		verifier.onReply(alice, answer(sent.get(), alice.uuid(), "main", false));
		assertFalse(notLoggedIn.get().authenticated());

		PlayerRef bob = new PlayerRef(UUID.randomUUID(), "Bob");
		CompletableFuture<AuthGate.AuthDecision> wrongReceiver = verifier.request(alice, sent::set);
		verifier.onReply(bob, answer(sent.get(), bob.uuid(), "main", true));
		assertFalse(wrongReceiver.get().authenticated());
	}

	@Test
	void unsignedClientMessagesAreIgnoredAndTimeOut() throws Exception {
		ProxyAuthVerifier verifier = verifier();
		AtomicReference<byte[]> sent = new AtomicReference<>();
		CompletableFuture<AuthGate.AuthDecision> decision = verifier.request(alice, sent::set);
		AuthAssertion.Query q = AuthAssertion.decodeQuery(sent.get());
		byte[] forged = AuthAssertion.encodeReply(
				new AuthAssertion.Reply(q.nonce(), alice.uuid(), "Alice", "main", true, "veloauth", clock.millis()),
				SecureTokens.randomBytes(32));
		verifier.onReply(alice, forged);
		assertEquals("proxy_timeout", decision.get().reason());
		assertEquals(0, verifier.pending());
	}

	@Test
	void missingSecretFailsClosed() throws Exception {
		ProxyAuthVerifier verifier = new ProxyAuthVerifier(null, "main", clock, Duration.ofSeconds(1), Logger.getLogger("t"));
		assertFalse(verifier.configured());
		assertEquals("proxy_secret_missing", verifier.request(alice, b -> {}).get().reason());
	}

	@Test
	void skinPngValidationRejectsBadInput() throws Exception {
		assertEquals(64, SkinPng.dimensions(SkinPng.sanitize(png(64, 64)))[1]);
		assertEquals(32, SkinPng.dimensions(SkinPng.sanitize(png(64, 32)))[1]);
		assertThrows(SkinPng.InvalidSkinException.class, () -> SkinPng.sanitize(png(128, 128)));
		assertThrows(SkinPng.InvalidSkinException.class, () -> SkinPng.sanitize("hello".getBytes(StandardCharsets.UTF_8)));
		assertThrows(SkinPng.InvalidSkinException.class, () -> SkinPng.sanitize(new byte[SkinPng.MAX_BYTES + 1]));
		assertThrows(SkinPng.InvalidSkinException.class, () -> SkinPng.decodeBase64("%%%"));
		assertThrows(SkinPng.InvalidSkinException.class, () -> SkinPng.decodeBase64("A".repeat(SkinPng.MAX_BYTES * 2)));

		byte[] bomb = png(64, 64);
		bomb[16] = 0;
		bomb[17] = 0;
		bomb[18] = (byte) 0x75;
		bomb[19] = 0x30;
		CRC32 crc = new CRC32();
		crc.update(bomb, 12, 17);
		long value = crc.getValue();
		bomb[29] = (byte) (value >>> 24);
		bomb[30] = (byte) (value >>> 16);
		bomb[31] = (byte) (value >>> 8);
		bomb[32] = (byte) value;
		assertEquals("bad_dimensions", assertThrows(SkinPng.InvalidSkinException.class, () -> SkinPng.sanitize(bomb)).getMessage());

		byte[] corrupt = png(64, 64);
		for (int i = 40; i < corrupt.length - 12; i++) {
			corrupt[i] = 0x55;
		}
		assertThrows(SkinPng.InvalidSkinException.class, () -> SkinPng.sanitize(corrupt));
	}

	@Test
	void sanitizedPngKeepsPixelsAndDropsMetadata() throws Exception {
		byte[] clean = SkinPng.sanitize(png(64, 64));
		BufferedImage image = ImageIO.read(new java.io.ByteArrayInputStream(clean));
		assertEquals(0x80ff0000, image.getRGB(1, 1));
		assertFalse(new String(clean, StandardCharsets.ISO_8859_1).contains("tEXt"));
	}
}
