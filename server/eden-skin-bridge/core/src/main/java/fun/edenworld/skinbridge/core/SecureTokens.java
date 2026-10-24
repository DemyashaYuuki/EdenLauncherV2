package fun.edenworld.skinbridge.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/** Cryptographic helpers: random secrets, SHA-256 and constant-time comparison. */
public final class SecureTokens {
	private static final SecureRandom RANDOM = new SecureRandom();

	private SecureTokens() {}

	public static byte[] randomBytes(int length) {
		byte[] bytes = new byte[length];
		RANDOM.nextBytes(bytes);
		return bytes;
	}

	/** URL-safe base64 without padding, {@code bytes} of entropy. */
	public static String randomSecret(int bytes) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes(bytes));
	}

	public static String randomId() {
		return HexFormat.of().formatHex(randomBytes(12));
	}

	public static int randomIndex(int bound) {
		return RANDOM.nextInt(bound);
	}

	public static byte[] sha256(String value) {
		return sha256(value.getBytes(StandardCharsets.UTF_8));
	}

	public static byte[] sha256(byte[] value) {
		try {
			return MessageDigest.getInstance("SHA-256").digest(value);
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("SHA-256 unavailable", e);
		}
	}

	public static String sha256Hex(String value) {
		return HexFormat.of().formatHex(sha256(value));
	}

	/** Compares two secrets without leaking the position of the first difference. */
	public static boolean constantTimeEquals(byte[] a, byte[] b) {
		return a != null && b != null && MessageDigest.isEqual(a, b);
	}
}
