# Attricat host ABI (WIT)

The `attricat:host` WIT packages a server component is built against, one file
per released ABI version. Each is a verbatim copy of the frozen snapshot in the
Attricat core repository (`crates/extension-runtime/wit-released/`), which
defines the ABI; a released version never changes, and later versions only add.

Copy the version your manifest's `attricat.host_api` targets into your
component's `wit/` directory and generate bindings from it, for example with
`wit_bindgen::generate!({ path: "wit", world: "outcome-extension" })`. A
component must import nothing but `attricat:host` at that version.

`pnpm check-wit` compares these files with a core checkout
(`ATTRICAT_CORE_DIR`, default `../attricat/main`); it fails when a released
snapshot is missing or differs.
