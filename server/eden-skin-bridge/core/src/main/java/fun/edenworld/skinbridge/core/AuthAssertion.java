package fun.edenworld.skinbridge.core;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.time.Clock;
import java.util.Arrays;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Binary messages on the {@code edenskinbridge:auth} channel between the backend plugin and the
 * Velocity companion.
 *
 * <p>The backend sends a query with a fresh nonce for one player; the proxy answers with the
 * authentication result for the connection it actually forwards, the backend server name and a
 * timestamp, all covered by an HMAC-SHA256 over a secret shared only by the two plugins. Clients
 * cannot forge replies (no secret), cannot replay them (single-use nonce, 30 s window) and cannot
 * redirect them to another backend (server name is signed).
 */
public final class AuthAssertion {
	public static final String CHANNEL = "edenskinbridge:auth";
	public static final byte VERSION = 1;
	public static final byte TYPE_QUERY = 1;
	public static final byte TYPE_REPLY = 2;
	public static final long MAX_AGE_MILLIS = 30_000;
	public static final int MIN_SECRET_BYTES = 32;
	private static final int MAX_MESSAGE = 1024;

	public record Query(byte[] nonce, UUID player, long timestamp) {}

	public record Reply(
			byte[] nonce, UUID player, String name, String server, boolean authenticated, String adapter, long timestamp) {}

	public static final class InvalidAssertionException extends Exception {
		private static final long serialVersionUID = 1L;

		public InvalidAssertionException(String message) {
			super(message);
		}
	}

	private AuthAssertion() {}

	public static byte[] encodeQuery(Query query) {
		try {
			ByteArrayOutputStream bytes = new ByteArrayOutputStream();
			DataOutputStream out = new DataOutputStream(bytes);
			out.writeByte(VERSION);
			out.writeByte(TYPE_QUERY);
			out.write(query.nonce());
			out.writeLong(query.player().getMostSignificantBits());
			out.writeLong(query.player().getLeastSignificantBits());
			out.writeLong(query.timestamp());
			return bytes.toByteArray();
		} catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}

	public static Query decodeQuery(byte[] message) throws InvalidAssertionException {
		if (message == null || message.length != 2 + 16 + 16 + 8) {
			throw new InvalidAssertionException("malformed_query");
		}
		try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(message))) {
			if (in.readByte() != VERSION || in.readByte() != TYPE_QUERY) {
				throw new InvalidAssertionException("malformed_query");
			}
			byte[] nonce = in.readNBytes(16);
			UUID player = new UUID(in.readLong(), in.readLong());
			return new Query(nonce, player, in.readLong());
		} catch (IOException e) {
			throw new InvalidAssertionException("malformed_query");
		}
	}

	private static byte[] body(Reply reply) throws IOException {
		ByteArrayOutputStream bytes = new ByteArrayOutputStream();
		DataOutputStream out = new DataOutputStream(bytes);
		out.writeByte(VERSION);
		out.writeByte(TYPE_REPLY);
		out.write(reply.nonce());
		out.writeLong(reply.player().getMostSignificantBits());
		out.writeLong(reply.player().getLeastSignificantBits());
		out.writeUTF(reply.name());
		out.writeUTF(reply.server());
		out.writeBoolean(reply.authenticated());
		out.writeUTF(reply.adapter());
		out.writeLong(reply.timestamp());
		return bytes.toByteArray();
	}

	public static byte[] hmac(byte[] secret, byte[] data) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(secret, "HmacSHA256"));
			return mac.doFinal(data);
		} catch (GeneralSecurityException e) {
			throw new IllegalStateException("HmacSHA256 unavailable", e);
		}
	}

	public static byte[] encodeReply(Reply reply, byte[] secret) {
		if (reply.nonce().length != 16) {
			throw new IllegalArgumentException("nonce must be 16 bytes");
		}
		try {
			byte[] body = body(reply);
			byte[] signature = hmac(secret, body);
			byte[] out = Arrays.copyOf(body, body.length + signature.length);
			System.arraycopy(signature, 0, out, body.length, signature.length);
			return out;
		} catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}

	/**
	 * Verifies signature, freshness and shape of a reply. Binding to an outstanding nonce, the
	 * receiving player and this backend's server name is checked by the caller.
	 */
	public static Reply decodeReply(byte[] message, byte[] secret, Clock clock) throws InvalidAssertionException {
		if (message == null || message.length < 2 + 16 + 16 + 32 || message.length > MAX_MESSAGE) {
			throw new InvalidAssertionException("malformed_reply");
		}
		byte[] body = Arrays.copyOf(message, message.length - 32);
		byte[] signature = Arrays.copyOfRange(message, message.length - 32, message.length);
		if (!SecureTokens.constantTimeEquals(hmac(secret, body), signature)) {
			throw new InvalidAssertionException("bad_signature");
		}
		Reply reply;
		try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(body))) {
			if (in.readByte() != VERSION || in.readByte() != TYPE_REPLY) {
				throw new InvalidAssertionException("malformed_reply");
			}
			byte[] nonce = in.readNBytes(16);
			UUID player = new UUID(in.readLong(), in.readLong());
			String name = in.readUTF();
			String server = in.readUTF();
			boolean authenticated = in.readBoolean();
			String adapter = in.readUTF();
			long timestamp = in.readLong();
			if (in.available() != 0) {
				throw new InvalidAssertionException("malformed_reply");
			}
			reply = new Reply(nonce, player, name, server, authenticated, adapter, timestamp);
		} catch (IOException e) {
			throw new InvalidAssertionException("malformed_reply");
		}
		long age = Math.abs(clock.millis() - reply.timestamp());
		if (age > MAX_AGE_MILLIS) {
			throw new InvalidAssertionException("stale_reply");
		}
		return reply;
	}

	public static byte[] parseSecret(String encoded) {
		if (encoded == null || encoded.isBlank()) {
			return null;
		}
		try {
			byte[] secret = java.util.Base64.getDecoder().decode(encoded.trim());
			return secret.length >= MIN_SECRET_BYTES ? secret : null;
		} catch (IllegalArgumentException e) {
			return null;
		}
	}
}
