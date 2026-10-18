// Hide the console window on Windows release builds; a no-op on Linux and macOS.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lattice_studio_lib::run()
}
