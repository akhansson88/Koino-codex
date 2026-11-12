const { withAppDelegate, withInfoPlist } = require("@expo/config-plugins");

const appDelegateClass = /^public class AppDelegate: ExpoAppDelegate \{$/gm;
const lifecycleMethod = /\bfunc\s+application(?:WillResignActive|DidEnterBackground|DidBecomeActive)\s*\(/;
const privacyMethods = `
  // KOINO app-switcher privacy
  private var koinoPrivacyCover: UIView?

  private func showKoinoPrivacyCover() {
    guard let window = window else { return }
    let cover = koinoPrivacyCover ?? UIView(frame: window.bounds)
    cover.backgroundColor = .black
    cover.isOpaque = true
    cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    cover.isUserInteractionEnabled = false
    cover.isAccessibilityElement = false
    cover.accessibilityElementsHidden = true
    cover.layer.zPosition = 1

    UIView.performWithoutAnimation {
      cover.frame = window.bounds
      if cover.superview !== window {
        window.addSubview(cover)
      }
      window.bringSubviewToFront(cover)
    }
    koinoPrivacyCover = cover
  }

  public override func applicationWillResignActive(_ application: UIApplication) {
    showKoinoPrivacyCover()
    super.applicationWillResignActive(application)
  }

  public override func applicationDidEnterBackground(_ application: UIApplication) {
    showKoinoPrivacyCover()
    super.applicationDidEnterBackground(application)
  }

  public override func applicationDidBecomeActive(_ application: UIApplication) {
    super.applicationDidBecomeActive(application)
    koinoPrivacyCover?.removeFromSuperview()
    koinoPrivacyCover = nil
  }
`;

module.exports = function withIOSAppSwitcherPrivacy(config) {
  config = withInfoPlist(config, result => {
    if (Object.hasOwn(result.modResults, "UIApplicationSceneManifest")) {
      throw new Error("KOINO app-switcher privacy requires the single-window app delegate lifecycle. A scene-based app needs a scene privacy cover.");
    }
    return result;
  });

  return withAppDelegate(config, result => {
    const { contents, language } = result.modResults;
    const source = contents.replace(/\r\n/g, "\n");
    const existing = source.includes(privacyMethods);
    const template = existing ? source.replace(privacyMethods, "") : source;
    const anchors = [...template.matchAll(appDelegateClass)];
    if (language !== "swift" || anchors.length !== 1 || !/^  var window: UIWindow\?$/m.test(template)
      || lifecycleMethod.test(template) || template.includes("koinoPrivacyCover")) {
      throw new Error("KOINO app-switcher privacy could not patch the generated Swift AppDelegate safely.");
    }
    if (existing) return result;

    const [anchor] = anchors;
    const offset = anchor.index + anchor[0].length;
    const imports = /^import UIKit$/m.test(source) ? "" : "import UIKit\n";
    result.modResults.contents = imports + source.slice(0, offset) + "\n" + privacyMethods + source.slice(offset);
    return result;
  });
};
