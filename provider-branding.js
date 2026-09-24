(() => {
  "use strict";

  const brands = {
    "Northstar Title & Settlement": {
      logo: "assets/provider-logos/northstar-title-settlement.png",
      alt: "Northstar Title & Settlement logo"
    },
    "Meridian Closing Services": {
      logo: "assets/provider-logos/meridian-closing-services.png",
      alt: "Meridian Closing Services logo"
    },
    "MetroLine Realty Group": {
      logo: "assets/provider-logos/metroline-realty-group.png",
      alt: "MetroLine Realty Group logo"
    },
    "SummitCraft Contractors": {
      logo: "assets/provider-logos/summitcraft-contractors.png",
      alt: "SummitCraft Contractors logo"
    },
    "HarborKey Property Management": {
      logo: "assets/provider-logos/harborkey-property-management.png",
      alt: "HarborKey Property Management logo"
    }
  };

  function cleanName(name) {
    return String(name || "").replace(/\s*·\s*demonstration\s*$/i, "").trim();
  }

  function get(name) {
    return brands[cleanName(name)] || null;
  }

  function apply(img, name) {
    if (!img) return false;
    const brand = get(name);
    if (!brand) {
      img.hidden = true;
      img.removeAttribute("src");
      img.alt = "";
      return false;
    }
    img.src = brand.logo;
    img.alt = brand.alt;
    img.hidden = false;
    return true;
  }

  globalThis.MREO_PROVIDER_BRANDING = {brands, cleanName, get, apply};
})();