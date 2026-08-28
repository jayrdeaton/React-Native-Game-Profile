import ExpoModulesCore

// Generic group/key -> JSON-string bridge onto a native iOS App Group's shared UserDefaults suite
// — the mechanism that actually lets two separate apps (same Apple Developer Team, both declaring
// the same "com.apple.security.application-groups" entitlement) read and write one common blob of
// data. Nothing here is @tastic/profile-specific — see src/sharedProfileStore.ts, the one caller,
// for the profile-roster-shaped API built on top of this. Android/web never register this module
// at all (see expo-module.config.json's "apple"-only platform list), so a consuming app has to
// treat "module not present" as a normal, expected case rather than an error.
public final class TasticProfileModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TasticProfile")

    AsyncFunction("getSharedJSON") { (groupId: String, key: String) -> String? in
      UserDefaults(suiteName: groupId)?.string(forKey: key)
    }

    AsyncFunction("setSharedJSON") { (groupId: String, key: String, value: String) -> Void in
      UserDefaults(suiteName: groupId)?.set(value, forKey: key)
    }
  }
}
