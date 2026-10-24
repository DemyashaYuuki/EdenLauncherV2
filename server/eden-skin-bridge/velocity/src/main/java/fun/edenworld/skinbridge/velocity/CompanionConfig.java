package fun.edenworld.skinbridge.velocity;

import fun.edenworld.skinbridge.core.AuthAssertion;
import fun.edenworld.skinbridge.core.SecureTokens;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Arrays;
import java.util.Base64;
import java.util.Properties;
import java.util.Set;
import java.util.stream.Collectors;

/** {@code plugins/edenskinbridge/config.properties}; a random shared secret is created on first start. */
record CompanionConfig(byte[] secret, String adapter, Set<String> allowedServers, Set<String> veloAuthVersions) {
	static final String FILE = "config.properties";

	static CompanionConfig load(Path dataDirectory) throws IOException {
		Files.createDirectories(dataDirectory);
		Path file = dataDirectory.resolve(FILE);
		if (!Files.exists(file)) {
			writeTemplate(file);
		}
		Properties properties = new Properties();
		try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
			properties.load(reader);
		}
		return new CompanionConfig(
				AuthAssertion.parseSecret(properties.getProperty("shared-secret", "")),
				properties.getProperty("auth-adapter", "auto").trim().toLowerCase(java.util.Locale.ROOT),
				split(properties.getProperty("allowed-servers", "main")),
				split(properties.getProperty("veloauth-supported-versions", "1.6.2-offline.2")));
	}

	private static Set<String> split(String value) {
		return Arrays.stream(value.split(","))
				.map(String::trim)
				.filter(s -> !s.isEmpty())
				.collect(Collectors.toUnmodifiableSet());
	}

	private static void writeTemplate(Path file) throws IOException {
		String secret = Base64.getEncoder().encodeToString(SecureTokens.randomBytes(32));
		try (Writer writer = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
			writer.write("""
					# EdenSkinBridge Velocity companion.
					# Copy shared-secret into plugins/EdenSkinBridge/config.yml (proxy.shared-secret) on the
					# backend. Use the same secret on every proxy in front of that backend. Keep it private.
					shared-secret=%s
					# veloauth | nlogin | auto (VeloAuth when installed, otherwise nLogin)
					auth-adapter=auto
					# Backend server names (from velocity.toml) allowed to ask for authentication results.
					allowed-servers=main
					# Exact VeloAuth versions whose internal API was inspected. Other versions are refused.
					veloauth-supported-versions=1.6.2-offline.2
					""".formatted(secret));
		}
		try {
			Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-------"));
		} catch (UnsupportedOperationException e) {
			// Windows has no POSIX permissions; the file inherits the folder ACL.
		}
	}
}
