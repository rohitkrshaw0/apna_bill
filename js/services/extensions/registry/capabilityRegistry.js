// registry/capabilityRegistry.js
// The Capability Registry (Milestone 11F section "Capability Registry"):
// "Extensions declare capabilities instead of directly coupling to other
// extensions." A capability is just a name a provider extension declares
// it satisfies (ExtensionDefinition.capabilities) -- another extension
// that needs "something that does X" looks up providers of capability
// "X" here rather than hardcoding a specific extension's id. This is a
// real decoupling mechanism: swapping which extension provides a given
// capability, or having two extensions provide the same one, requires no
// change to whichever extension consumes it.
//
// This registry is deliberately dumb -- it does not enforce that a
// capability has exactly one provider, does not rank providers, and does
// not resolve "the" provider automatically; a consumer decides what to
// do with the (possibly empty, possibly multi-element) list
// getProviders() returns. Anything smarter belongs to a future milestone
// that has a concrete need for it, not this one ("do not over-engineer").

export function createCapabilityRegistry () {
  /** @type {Map<string, Set<string>>} capability name -> Set of provider extension ids */
  const providersByCapability = new Map();
  /** @type {Map<string, string[]>} extension id -> capabilities it declared, for unregisterCapabilities() */
  const capabilitiesByExtension = new Map();

  /** @param {string} extensionId @param {string[]} capabilities */
  function registerCapabilities (extensionId, capabilities) {
    capabilitiesByExtension.set(extensionId, [...capabilities]);
    for (const capability of capabilities) {
      if (!providersByCapability.has(capability)) providersByCapability.set(capability, new Set());
      providersByCapability.get(capability).add(extensionId);
    }
  }

  /** @param {string} extensionId */
  function unregisterCapabilities (extensionId) {
    const capabilities = capabilitiesByExtension.get(extensionId) || [];
    for (const capability of capabilities) {
      providersByCapability.get(capability)?.delete(extensionId);
    }
    capabilitiesByExtension.delete(extensionId);
  }

  /** @param {string} capability @returns {string[]} every extension id that declared this capability */
  function getProviders (capability) {
    return [...(providersByCapability.get(capability) || [])];
  }

  /** @param {string} capability @returns {boolean} */
  function hasCapability (capability) {
    return (providersByCapability.get(capability)?.size ?? 0) > 0;
  }

  /** @returns {string[]} every capability at least one currently-registered extension declares */
  function listCapabilities () {
    return [...providersByCapability.keys()].filter((c) => providersByCapability.get(c).size > 0);
  }

  function clear () {
    providersByCapability.clear();
    capabilitiesByExtension.clear();
  }

  return { registerCapabilities, unregisterCapabilities, getProviders, hasCapability, listCapabilities, clear };
}
