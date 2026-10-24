package fun.edenworld.skinbridge.velocity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.velocitypowered.api.proxy.Player;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import java.util.jar.JarFile;
import org.junit.jupiter.api.Test;

/**
 * Checks the method signatures the adapter relies on against the user's real VeloAuth JAR without
 * running any of its code: classes are loaded with initialization disabled and only reflected.
 * Runs when {@code -PveloauthJar=<path>} is passed to Gradle; skipped otherwise.
 */
class RealVeloAuthContractTest {
	private static final String EXPECTED_SHA256 = "6384460ebb373b646c4fee196184cb412610c0407a70eb75c5aec82f937bd8cd";

	@Test
	void realJarExposesTheInspectedApi() throws Exception {
		String configured = System.getProperty("veloauth.jar", "");
		assumeTrue(!configured.isBlank() && Files.isRegularFile(Path.of(configured)), "VeloAuth JAR not provided");
		Path jar = Path.of(configured);
		assertEquals(EXPECTED_SHA256, HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(jar))));
		try (JarFile file = new JarFile(jar.toFile())) {
			try (InputStream in = file.getInputStream(file.getEntry("velocity-plugin.json"))) {
				String descriptor = new String(in.readAllBytes(), StandardCharsets.UTF_8);
				assertTrue(descriptor.contains("\"version\": \"1.6.2-offline.2\""));
				assertTrue(descriptor.contains("\"id\": \"veloauth\""));
			}
		}
		try (URLClassLoader loader = new URLClassLoader(new URL[] {jar.toUri().toURL()}, getClass().getClassLoader()) {
			@Override
			protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
				synchronized (getClassLoadingLock(name)) {
					if (!name.startsWith("net.rafalohaki.veloauth.")) return super.loadClass(name, resolve);
					Class<?> loaded = findLoadedClass(name);
					if (loaded == null) loaded = findClass(name);
					if (resolve) resolveClass(loaded);
					return loaded;
				}
			}
		}) {
			Class<?> main = Class.forName(VeloAuthAdapter.MAIN_CLASS, false, loader);
			Class<?> cache = Class.forName(VeloAuthAdapter.CACHE_CLASS, false, loader);
			Class<?> address = Class.forName(VeloAuthAdapter.ADDRESS_CLASS, false, loader);
			Class<?> totp = Class.forName(VeloAuthAdapter.TOTP_STORE_CLASS, false, loader);
			assertEquals(loader, main.getClassLoader(), "Must inspect the real JAR, not the unit-test stub");
			assertEquals(jar.toUri().toURL(), main.getProtectionDomain().getCodeSource().getLocation());
			assertEquals(boolean.class, main.getMethod("isInitialized").getReturnType());
			assertEquals(cache, main.getMethod("getAuthCache").getReturnType());
			assertEquals(totp, main.getMethod("getPendingTotpStore").getReturnType());
			assertEquals(boolean.class, cache.getMethod("isPlayerAuthorized", UUID.class, String.class).getReturnType());
			assertEquals(boolean.class, cache.getMethod("hasActiveSession", UUID.class, String.class, String.class).getReturnType());
			Method ip = address.getMethod("getPlayerIp", Player.class);
			assertTrue(Modifier.isStatic(ip.getModifiers()));
			assertEquals(String.class, ip.getReturnType());
			assertEquals(Optional.class, totp.getMethod("get", UUID.class).getReturnType());
		}
	}
}
