// A one-off macOS helper for the completion-key probe (run.sh). It posts REAL key events through the OS event system
// (CGEvent at the HID tap), so a system shortcut such as Ctrl-Space ("Select the previous input source") sees them
// first, exactly as it sees a person's keystroke. Browser automation cannot show this: Playwright and WebDriver hand
// their keys to the browser directly, past the OS shortcut layer.
//   keys trusted                 → whether this process may post events (Accessibility / PostEvent)
//   keys sources                 → the enabled keyboard input sources, and the current one
//   keys enable <id>             → enable an installed input source (e.g. com.apple.keylayout.ABC)
//   keys activate                → bring the newest Chromium-family app to the front
//   keys press <keycode> <mods>  → post keydown+keyup; mods is a comma list of ctrl,alt,cmd,shift or "none"
import AppKit
import Carbon
import Foundation

func sources() -> [String] {
  let props = [kTISPropertyInputSourceCategory as String: kTISCategoryKeyboardInputSource as String] as CFDictionary
  guard let list = TISCreateInputSourceList(props, false)?.takeRetainedValue() as? [TISInputSource] else { return [] }
  return list.compactMap { s in
    guard let p = TISGetInputSourceProperty(s, kTISPropertyInputSourceID) else { return nil }
    let id = Unmanaged<CFString>.fromOpaque(p).takeUnretainedValue() as String
    let sel = TISGetInputSourceProperty(s, kTISPropertyInputSourceIsSelectCapable).map { Unmanaged<CFBoolean>.fromOpaque($0).takeUnretainedValue() == kCFBooleanTrue } ?? false
    return sel ? id : nil
  }
}
func current() -> String {
  let s = TISCopyCurrentKeyboardInputSource().takeRetainedValue()
  guard let p = TISGetInputSourceProperty(s, kTISPropertyInputSourceID) else { return "?" }
  return Unmanaged<CFString>.fromOpaque(p).takeUnretainedValue() as String
}

let args = CommandLine.arguments
switch args.count > 1 ? args[1] : "" {
case "trusted":
  var post = "n/a"
  if #available(macOS 10.15, *) { post = CGPreflightPostEventAccess() ? "true" : "false" }
  print("{\"accessibility\":\(AXIsProcessTrusted()),\"postEvent\":\(post)}")
case "sources":
  let data = try! JSONSerialization.data(withJSONObject: ["enabled": sources(), "current": current()])
  print(String(data: data, encoding: .utf8)!)
case "enable":
  let props = [kTISPropertyInputSourceID as String: args[2]] as CFDictionary
  guard let list = TISCreateInputSourceList(props, true)?.takeRetainedValue() as? [TISInputSource], let s = list.first else { print("{\"enabled\":false,\"why\":\"not installed\"}"); exit(0) }
  let err = TISEnableInputSource(s)
  print("{\"enabled\":\(err == noErr),\"status\":\(err)}")
case "activate":
  let apps = NSWorkspace.shared.runningApplications.filter { ($0.bundleIdentifier ?? "").lowercased().contains("chrom") }
  let app = apps.max { ($0.launchDate ?? .distantPast) < ($1.launchDate ?? .distantPast) }
  let ok = app?.activate(options: [.activateIgnoringOtherApps]) ?? false
  print("{\"activated\":\(ok),\"bundle\":\"\(app?.bundleIdentifier ?? "none")\"}")
case "press":
  let code = CGKeyCode(Int(args[2])!)
  var flags = CGEventFlags()
  for m in args[3].split(separator: ",") {
    switch m { case "ctrl": flags.insert(.maskControl); case "alt": flags.insert(.maskAlternate); case "cmd": flags.insert(.maskCommand); case "shift": flags.insert(.maskShift); default: break }
  }
  let src = CGEventSource(stateID: .hidSystemState)
  for down in [true, false] {
    let e = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: down)!
    e.flags = flags
    e.post(tap: .cghidEventTap)
    usleep(60_000)
  }
  print("{\"posted\":true}")
default:
  FileHandle.standardError.write("usage: keys trusted|sources|enable <id>|activate|press <keycode> <mods>\n".data(using: .utf8)!)
  exit(2)
}
