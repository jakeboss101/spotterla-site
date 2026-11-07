// Domain-restricted MapKit JS token for spotterla.com.
const MAPKIT_TOKEN = "eyJraWQiOiI0WkJTTjRWSEZLIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJTWlJKOTdGMzNaIiwiaWF0IjoxNzk0MDIyNTMwLCJvcmlnaW4iOiJzcG90dGVybGEuY29tIiwic2NvcGUiOiJtYXBraXRfanMifQ.wRn6mZkYBi6r_Qrbcib-Mdciy3DQzavEVjBETPlWhlXITziqaxHPi6Pn27BZCQGD-Lbq6FTZGLvXQeZOkz_fGA";

(() => {
    const list = document.getElementById("camera-list");
    const mapElement = document.getElementById("map");
    const mapMessage = document.getElementById("map-message");
    const searchInput = document.getElementById("search");
    const resultSummary = document.getElementById("result-summary");
    const copyStatus = document.getElementById("copy-status");
    const nearMeButton = document.getElementById("near-me");
    const filterButtons = [...document.querySelectorAll("[data-filter]")];

    let cameras = [];
    let map;
    let selectedId = null;
    let activeFilter = "all";
    let nearMePosition = null;
    const cameraByAnnotation = new WeakMap();

    const escapeText = (value) => String(value ?? "");

    function createCameraRow(camera) {
        const row = document.createElement("li");
        row.className = "camera-row";
        row.dataset.cameraId = camera.id;
        row.dataset.status = camera.status;
        row.dataset.search = [camera.street, camera.fromStreet, camera.toStreet]
            .join(" ").toLocaleLowerCase();

        const select = document.createElement("button");
        select.className = "camera-select";
        select.type = "button";
        select.dataset.cameraId = camera.id;
        select.setAttribute("aria-pressed", "false");

        const street = document.createElement("strong");
        street.textContent = camera.street;
        const between = document.createElement("span");
        const streets = [camera.fromStreet, camera.toStreet].filter(Boolean);
        between.textContent = streets.length ? `between ${streets.join(" and ")}` : "";
        const meta = document.createElement("span");
        meta.className = "camera-row-meta";

        const badge = document.createElement("span");
        badge.className = `badge ${camera.status}`;
        badge.textContent = camera.statusLabel;
        meta.append(badge);

        if (camera.speedLimit !== null && camera.speedLimit !== undefined) {
            const limit = document.createElement("span");
            limit.className = "camera-limit";
            limit.textContent = `Limit ${camera.speedLimit} mph`;
            meta.append(limit);
        }

        const distance = document.createElement("span");
        distance.className = "camera-distance";
        distance.hidden = true;
        meta.append(distance);

        select.append(street, between, meta);

        const share = document.createElement("button");
        share.className = "share-button";
        share.type = "button";
        share.dataset.cameraId = camera.id;
        share.setAttribute("aria-label", `Share ${camera.street} camera location`);
        share.textContent = "Share";
        row.append(select, share);
        return row;
    }

    function showNewLocations() {
        const section = document.getElementById("new-locations");
        const newList = document.getElementById("new-location-list");
        const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
        const recent = cameras
            .filter((camera) => {
                if (!camera.addedDate) return false;
                const added = Date.parse(`${camera.addedDate}T00:00:00Z`);
                return Number.isFinite(added) && added >= cutoff && added <= Date.now();
            })
            .sort((a, b) => b.addedDate.localeCompare(a.addedDate));

        newList.replaceChildren();
        for (const camera of recent) {
            const item = document.createElement("li");
            const date = new Date(`${camera.addedDate}T00:00:00Z`);
            item.textContent = `${camera.street} · ${date.toLocaleDateString(undefined, {
                year: "numeric", month: "short", day: "numeric", timeZone: "UTC"
            })}`;
            newList.append(item);
        }
        section.hidden = recent.length === 0;
    }

    function distanceBetween(position, camera) {
        const radians = (degrees) => degrees * Math.PI / 180;
        const dLat = radians(camera.lat - position.latitude);
        const dLon = radians(camera.lon - position.longitude);
        const latitude1 = radians(position.latitude);
        const latitude2 = radians(camera.lat);
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(dLon / 2) ** 2;
        return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function updateDistances() {
        for (const row of list.querySelectorAll(".camera-row")) {
            const camera = cameras.find((item) => item.id === row.dataset.cameraId);
            const distance = row.querySelector(".camera-distance");
            if (!camera || !nearMePosition) {
                distance.hidden = true;
                distance.textContent = "";
                continue;
            }
            const miles = distanceBetween(nearMePosition, camera);
            distance.textContent = `${miles < 0.1 ? `${Math.round(miles * 5280)} ft` : `${miles.toFixed(1)} mi`} away`;
            distance.hidden = false;
        }
    }

    function applyFilters() {
        const query = searchInput.value.trim().toLocaleLowerCase();
        const ordered = nearMePosition
            ? [...cameras].sort((a, b) => distanceBetween(nearMePosition, a) - distanceBetween(nearMePosition, b))
            : cameras;
        let visibleCount = 0;

        for (const camera of ordered) {
            const row = list.querySelector(`[data-camera-id="${CSS.escape(camera.id)}"].camera-row`);
            if (!row) continue;
            const matchesFilter = activeFilter === "all"
                || (activeFilter === "live" && camera.status === "live")
                || (activeFilter === "coming" && camera.status !== "live");
            const matchesSearch = !query || row.dataset.search.includes(query);
            row.hidden = !(matchesFilter && matchesSearch);
            if (!row.hidden) visibleCount += 1;
            list.append(row);
        }

        resultSummary.textContent = nearMePosition
            ? `${visibleCount} locations, nearest first`
            : `${visibleCount} Los Angeles locations`;
    }

    function updateSelectedRow() {
        for (const row of list.querySelectorAll(".camera-row")) {
            const isSelected = row.dataset.cameraId === selectedId;
            row.classList.toggle("selected", isSelected);
            row.querySelector(".camera-select").setAttribute("aria-pressed", String(isSelected));
        }
    }

    function updateCameraHash(cameraId) {
        const hash = `#camera=${encodeURIComponent(cameraId)}`;
        if (location.hash !== hash) history.replaceState(null, "", hash);
    }

    function selectCamera(cameraId, updateHash = true) {
        const camera = cameras.find((item) => item.id === cameraId);
        if (!camera) return;
        selectedId = camera.id;
        updateSelectedRow();
        const row = list.querySelector(`[data-camera-id="${CSS.escape(camera.id)}"].camera-row`);
        row?.scrollIntoView({ block: "nearest" });
        if (updateHash) updateCameraHash(camera.id);
        if (map) {
            const center = new mapkit.Coordinate(camera.lat, camera.lon);
            map.region = new mapkit.CoordinateRegion(
                center,
                new mapkit.CoordinateSpan(0.025, 0.025)
            );
        }
    }

    function shareText(camera) {
        const streets = [camera.fromStreet, camera.toStreet].filter(Boolean);
        // Only say "between" when both cross streets are known.
        const parts = [streets.length === 2
            ? `Speed camera on ${camera.street}, between ${streets.join(" and ")}.`
            : `Speed camera on ${camera.street}.`];
        if (camera.speedLimit !== null && camera.speedLimit !== undefined) {
            parts.push(`Limit ${camera.speedLimit} mph.`);
        }
        const url = `https://spotterla.com/#camera=${encodeURIComponent(camera.id)}`;
        return `${parts.join(" ")}\n${url}`;
    }

    async function copyText(text) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const field = document.createElement("textarea");
        field.value = text;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("Clipboard access is unavailable.");
    }

    async function shareCamera(camera) {
        const text = shareText(camera);
        if (navigator.share) {
            try {
                await navigator.share({ text });
            } catch (error) {
                if (error.name !== "AbortError") {
                    console.error("Could not share camera location:", error);
                    copyStatus.textContent = "Sharing failed. Please try again.";
                }
            }
            return;
        }

        try {
            await copyText(text);
            copyStatus.textContent = "Link copied";
        } catch (error) {
            console.error("Could not copy camera link:", error);
            copyStatus.textContent = "Could not copy link. Please copy it from the address bar.";
        }
    }

    function setMapError(message) {
        mapElement.classList.remove("map-ready");
        mapMessage.textContent = message;
        mapMessage.hidden = false;
    }

    function calculateInitialRegion() {
        const latitudes = cameras.map((camera) => camera.lat);
        const longitudes = cameras.map((camera) => camera.lon);
        const minLat = Math.min(...latitudes);
        const maxLat = Math.max(...latitudes);
        const minLon = Math.min(...longitudes);
        const maxLon = Math.max(...longitudes);
        return new mapkit.CoordinateRegion(
            new mapkit.Coordinate((minLat + maxLat) / 2, (minLon + maxLon) / 2),
            new mapkit.CoordinateSpan(
                Math.max(0.18, (maxLat - minLat) * 1.25),
                Math.max(0.22, (maxLon - minLon) * 1.25)
            )
        );
    }

    function initializeMapKit() {
        try {
            map = new mapkit.Map(mapElement, {
                region: calculateInitialRegion(),
                showsTraffic: false,
                showsCompass: mapkit.FeatureVisibility.Hidden,
                showsMapTypeControl: false,
                pointOfInterestFilter: mapkit.PointOfInterestFilter.excludingAllCategories
            });
            map.showsTraffic = false;
            // The app's soft, muted colors, so the camera pins stand out.
            map.mapType = mapkit.Map.MapTypes.MutedStandard;
            // MapKit JS doesn't follow the system appearance by itself; match light/dark mode,
            // including when it changes while the page is open.
            const darkMode = window.matchMedia("(prefers-color-scheme: dark)");
            const applyColorScheme = () => {
                map.colorScheme = darkMode.matches
                    ? mapkit.Map.ColorSchemes.Dark
                    : mapkit.Map.ColorSchemes.Light;
            };
            applyColorScheme();
            darkMode.addEventListener("change", applyColorScheme);

            // Same pins as the iPhone app: a white camera in a red (live) or gray marker,
            // with just the speed limit underneath.
            const cameraGlyph = {
                1: "/images/camera-glyph.png?v=2",
                2: "/images/camera-glyph@2x.png?v=2",
                3: "/images/camera-glyph@3x.png?v=2"
            };
            const annotations = cameras.map((camera) => {
                const hasLimit = camera.speedLimit !== null && camera.speedLimit !== undefined;
                const options = {
                    color: camera.status === "live" ? "#e3262f" : "#8e8e93",
                    glyphImage: cameraGlyph,
                    title: hasLimit ? `${camera.speedLimit} mph` : "",
                    titleVisibility: mapkit.FeatureVisibility.Visible,
                    subtitleVisibility: mapkit.FeatureVisibility.Hidden,
                    enabled: true
                };
                const annotation = new mapkit.MarkerAnnotation(
                    new mapkit.Coordinate(camera.lat, camera.lon),
                    options
                );
                cameraByAnnotation.set(annotation, camera.id);
                return annotation;
            });
            map.addEventListener("select", (event) => {
                const cameraId = cameraByAnnotation.get(event.annotation);
                if (cameraId) selectCamera(cameraId);
            });
            map.addAnnotations(annotations);
            mapElement.classList.add("map-ready");
            mapMessage.hidden = true;
            if (nearMePosition) {
                map.region = new mapkit.CoordinateRegion(
                    new mapkit.Coordinate(nearMePosition.latitude, nearMePosition.longitude),
                    new mapkit.CoordinateSpan(0.04, 0.04)
                );
            }
            if (selectedId) selectCamera(selectedId, false);
        } catch (error) {
            console.error("MapKit could not initialize:", error);
            setMapError("The map couldn't load. Please check the MapKit token and try again. The camera list is still available.");
        }
    }

    function loadMap() {
        if (!MAPKIT_TOKEN || MAPKIT_TOKEN === "PASTE_TOKEN_HERE") {
            setMapError("The map is not configured yet. The camera list is ready to use.");
            return;
        }
        window.spotterlaMapKitReady = () => {
            delete window.spotterlaMapKitReady;
            initializeMapKit();
        };
        const script = document.createElement("script");
        script.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js";
        script.crossOrigin = "anonymous";
        script.dataset.callback = "spotterlaMapKitReady";
        script.dataset.libraries = "map,annotations";
        script.dataset.token = MAPKIT_TOKEN;
        script.async = true;
        script.onerror = () => {
            delete window.spotterlaMapKitReady;
            setMapError("The map couldn't load. Check your connection and try again. The camera list is still available.");
        };
        document.head.append(script);
    }

    function handleHashChange() {
        const params = new URLSearchParams(location.hash.slice(1));
        const cameraId = params.get("camera");
        if (!cameraId) {
            selectedId = null;
            updateSelectedRow();
            return;
        }
        if (!cameras.some((camera) => camera.id === cameraId)) {
            selectedId = null;
            updateSelectedRow();
            return;
        }
        activeFilter = "all";
        searchInput.value = "";
        for (const button of filterButtons) {
            const active = button.dataset.filter === "all";
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        }
        applyFilters();
        selectCamera(cameraId, false);
    }

    list.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-camera-id]");
        if (!button) return;
        const camera = cameras.find((item) => item.id === button.dataset.cameraId);
        if (!camera) return;
        if (button.classList.contains("share-button")) {
            shareCamera(camera);
        } else {
            selectCamera(camera.id);
        }
    });

    searchInput.addEventListener("input", applyFilters);
    for (const button of filterButtons) {
        button.addEventListener("click", () => {
            activeFilter = button.dataset.filter;
            for (const filterButton of filterButtons) {
                const active = filterButton === button;
                filterButton.classList.toggle("active", active);
                filterButton.setAttribute("aria-pressed", String(active));
            }
            applyFilters();
        });
    }

    nearMeButton.addEventListener("click", () => {
        if (nearMePosition) {
            nearMePosition = null;
            nearMeButton.setAttribute("aria-pressed", "false");
            nearMeButton.textContent = "Near me";
            updateDistances();
            applyFilters();
            return;
        }
        if (!navigator.geolocation) {
            resultSummary.textContent = "Your browser doesn't support location.";
            return;
        }
        nearMeButton.disabled = true;
        resultSummary.textContent = "Finding your location…";
        navigator.geolocation.getCurrentPosition(
            (position) => {
                nearMePosition = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                if (map) {
                    map.region = new mapkit.CoordinateRegion(
                        new mapkit.Coordinate(nearMePosition.latitude, nearMePosition.longitude),
                        new mapkit.CoordinateSpan(0.04, 0.04)
                    );
                }
                nearMeButton.disabled = false;
                nearMeButton.setAttribute("aria-pressed", "true");
                nearMeButton.textContent = "Clear location";
                updateDistances();
                applyFilters();
            },
            (error) => {
                nearMeButton.disabled = false;
                resultSummary.textContent = error.code === error.PERMISSION_DENIED
                    ? "Location permission was not granted."
                    : "Couldn't find your location. Please try again.";
            },
            { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
        );
    });

    async function loadCameras() {
        try {
            const response = await fetch("/data/cameras.json");
            if (!response.ok) throw new Error(`Camera data request failed: ${response.status}`);
            const data = await response.json();
            if (!Array.isArray(data)) throw new Error("Camera data has an unexpected format.");
            cameras = data.map((camera) => ({
                ...camera,
                id: escapeText(camera.id),
                street: escapeText(camera.street),
                fromStreet: escapeText(camera.fromStreet),
                toStreet: escapeText(camera.toStreet),
                statusLabel: escapeText(camera.statusLabel)
            }));

            list.replaceChildren(...cameras.map(createCameraRow));
            const liveCount = cameras.filter((camera) => camera.status === "live").length;
            const comingCount = cameras.length - liveCount;
            const liveNumber = document.querySelector("[data-count='live']");
            const comingNumber = document.querySelector("[data-count='coming']");
            if (liveNumber) liveNumber.textContent = `${liveCount} cameras live now`;
            if (comingNumber) comingNumber.textContent = `${comingCount} coming soon`;
            showNewLocations();
            updateDistances();
            applyFilters();
            handleHashChange();
            loadMap();
        } catch (error) {
            console.error("Could not load camera data:", error);
            resultSummary.textContent = "Camera data couldn't be loaded. Please refresh the page.";
            setMapError("Camera data couldn't be loaded. Please refresh the page.");
        }
    }

    window.addEventListener("hashchange", handleHashChange);
    loadCameras();
})();
