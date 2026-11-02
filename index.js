/**
 * Host half of the Panel Control bundle.
 *
 * Every contribution of this plugin is rendered by the Client module
 * (`./client.js`): the manager panel, the sidebar entry that opens it and the
 * settings section. The Host half only exists so the bundle has a loader entry
 * point — the sidebar's panel list is a Client-side concern, so there is no
 * Host service to register.
 */
export function apply() {}
