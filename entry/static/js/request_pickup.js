// static/js/request_pickup.js

document.addEventListener('DOMContentLoaded', function() {
    const parcelForm = document.getElementById('parcelForm');
    const stripePublishableKey = parcelForm ? parcelForm.dataset.stripeKey : null;
    const geocodeUrl = "https://nominatim.openstreetmap.org/search?format=json&q=";
    const reverseGeocodeUrl = "https://nominatim.openstreetmap.org/reverse?format=jsonv2";
    let map, pickupMarker, deliveryMarker, routingControl;
    let pickupCoords = null;
    let deliveryCoords = null;
    let pickupLocationText = '';
    let deliveryLocationText = '';

    const pickupInput = document.getElementById('pickup_location');
    const deliveryInput = document.getElementById('delivery_location');
    const currentLocationBtn = document.getElementById('currentLocationBtn');
    const confirmLocationsBtn = document.getElementById('confirmLocationsBtn');
    const editLocationsBtn = document.getElementById('editLocationsBtn');
    const proceedToReceiverBtn = document.getElementById('proceedToReceiverBtn');
    const backToRouteBtn = document.getElementById('backToRouteBtn');
    const proceedToPaymentBtn = document.getElementById('proceedToPaymentBtn');
    const backToReceiverBtn = document.getElementById('backToReceiverBtn');
    const payButton = document.getElementById('pay-button');

    const stepLocationsDiv = document.getElementById('step-locations');
    const stepRouteConfirmDiv = document.getElementById('step-route-confirm');
    const stepReceiverDiv = document.getElementById('step-receiver');
    const stepPaymentDiv = document.getElementById('step-payment');
    const stepThankYouDiv = document.getElementById('step-thank-you');

    const pickupErrorDiv = document.getElementById('pickup-error');
    const deliveryErrorDiv = document.getElementById('delivery-error');
    const routeInfoDiv = document.getElementById('route-info');

    function initMap() {
        map = L.map('map').setView([-1.286389, 36.817223], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        pickupMarker = L.marker(map.getCenter(), { draggable: true, autoPan: true }).addTo(map).bindPopup("Pickup Location (Drag Me)");
        deliveryMarker = L.marker(map.getCenter(), { draggable: true, autoPan: true }).addTo(map).bindPopup("Delivery Location (Drag Me)");

        pickupMarker.on('dragend', (e) => updateLocationFromMarker(e.target.getLatLng(), 'pickup'));
        deliveryMarker.on('dragend', (e) => updateLocationFromMarker(e.target.getLatLng(), 'delivery'));
    }

    function updateLocationFromMarker(latlng, type) {
        const url = `${reverseGeocodeUrl}&lat=${latlng.lat}&lon=${latlng.lng}`;
        fetch(url)
            .then(response => response.ok ? response.json() : Promise.reject('Network response was not ok.'))
            .then(data => {
                if (data && data.display_name) {
                    const address = data.display_name;
                    if (type === 'pickup') {
                        pickupInput.value = address;
                        pickupCoords = latlng;
                        pickupLocationText = address;
                        validateLocationInput(pickupInput, pickupErrorDiv, pickupCoords);
                    } else {
                        deliveryInput.value = address;
                        deliveryCoords = latlng;
                        deliveryLocationText = address;
                        validateLocationInput(deliveryInput, deliveryErrorDiv, deliveryCoords);
                    }
                    checkLocationsConfirmed();
                } else {
                    console.warn("Reverse geocoding failed or returned no address.");
                    if (type === 'pickup') validateLocationInput(pickupInput, pickupErrorDiv, null, "Could not determine address from map pin.");
                    else validateLocationInput(deliveryInput, deliveryErrorDiv, null, "Could not determine address from map pin.");
                }
            })
            .catch(error => {
                 console.error('Reverse Geocoding Error:', error)
                 if (type === 'pickup') validateLocationInput(pickupInput, pickupErrorDiv, null, "Error finding address.");
                 else validateLocationInput(deliveryInput, deliveryErrorDiv, null, "Error finding address.");
            });
    }

    function geocodeAddress(address, type) {
        if (!address || address.length < 3) {
             if (type === 'pickup') { pickupCoords = null; validateLocationInput(pickupInput, pickupErrorDiv, null); }
             else { deliveryCoords = null; validateLocationInput(deliveryInput, deliveryErrorDiv, null); }
             checkLocationsConfirmed();
             return;
        }
        const url = `${geocodeUrl}${encodeURIComponent(address)}`;
        const inputElement = (type === 'pickup') ? pickupInput : deliveryInput;
        const errorDiv = (type === 'pickup') ? pickupErrorDiv : deliveryErrorDiv;
        const marker = (type === 'pickup') ? pickupMarker : deliveryMarker;

        fetch(url)
            .then(response => response.ok ? response.json() : Promise.reject('Network response was not ok.'))
            .then(data => {
                if (data && data.length > 0) {
                    const bestResult = data[0];
                    const latlng = L.latLng(bestResult.lat, bestResult.lon);
                    marker.setLatLng(latlng);
                    if (type === 'pickup') {
                        pickupCoords = latlng;
                        pickupLocationText = inputElement.value;
                        validateLocationInput(inputElement, errorDiv, pickupCoords);
                    } else {
                        deliveryCoords = latlng;
                        deliveryLocationText = inputElement.value;
                        validateLocationInput(inputElement, errorDiv, deliveryCoords);
                    }
                    if (pickupCoords && deliveryCoords) {
                         map.fitBounds(L.latLngBounds(pickupCoords, deliveryCoords), { padding: [50, 50] });
                    } else {
                         map.setView(latlng, 15);
                    }
                    checkLocationsConfirmed();
                } else {
                    if (type === 'pickup') pickupCoords = null; else deliveryCoords = null;
                    validateLocationInput(inputElement, errorDiv, null, "Address not found.");
                    checkLocationsConfirmed();
                }
            })
            .catch(error => {
                console.error('Geocoding Error:', error);
                if (type === 'pickup') pickupCoords = null; else deliveryCoords = null;
                validateLocationInput(inputElement, errorDiv, null, "Geocoding error.");
                checkLocationsConfirmed();
            });
    }

    function validateLocationInput(inputElement, errorDiv, coords, customError = null) {
         inputElement.classList.remove('is-valid', 'is-invalid');
         errorDiv.textContent = '';
         if (customError) {
             inputElement.classList.add('is-invalid');
             errorDiv.textContent = customError;
             return false;
         } else if (coords && inputElement.value.trim() !== '') {
             inputElement.classList.add('is-valid');
             return true;
         } else if (inputElement.value.trim() !== '') {
             inputElement.classList.add('is-invalid');
             errorDiv.textContent = 'Address could not be verified.';
             return false;
         }
         return false;
    }

    function checkLocationsConfirmed() {
        const pickupValid = pickupCoords && pickupInput.classList.contains('is-valid');
        const deliveryValid = deliveryCoords && deliveryInput.classList.contains('is-valid');
        confirmLocationsBtn.disabled = !(pickupValid && deliveryValid);
    }

    currentLocationBtn.addEventListener('click', function() {
        currentLocationBtn.disabled = true;
        currentLocationBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Locating...';
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
                pickupMarker.setLatLng(latlng);
                map.setView(latlng, 15);
                updateLocationFromMarker(latlng, 'pickup');
                currentLocationBtn.disabled = false;
                currentLocationBtn.innerHTML = '<i class="fas fa-location-crosshairs me-1"></i> Use Current Location';
            }, error => {
                console.error("Geolocation error:", error);
                alert("Could not get current location. Please ensure location services are enabled and permissions granted.");
                validateLocationInput(pickupInput, pickupErrorDiv, null, "Could not get current location.");
                currentLocationBtn.disabled = false;
                currentLocationBtn.innerHTML = '<i class="fas fa-location-crosshairs me-1"></i> Use Current Location';
            }, { timeout: 10000 });
        } else {
            alert("Geolocation is not supported by this browser.");
             validateLocationInput(pickupInput, pickupErrorDiv, null, "Geolocation not supported.");
             currentLocationBtn.disabled = false;
             currentLocationBtn.innerHTML = '<i class="fas fa-location-crosshairs me-1"></i> Use Current Location';
        }
    });

    pickupInput.addEventListener('blur', () => {
        if (pickupInput.value.trim() !== pickupLocationText) {
             geocodeAddress(pickupInput.value, 'pickup');
        } else if (pickupInput.value.trim() === '') {
            pickupCoords = null;
            validateLocationInput(pickupInput, pickupErrorDiv, null);
            checkLocationsConfirmed();
        }
    });
    deliveryInput.addEventListener('blur', () => {
         if (deliveryInput.value.trim() !== deliveryLocationText) {
            geocodeAddress(deliveryInput.value, 'delivery');
         } else if (deliveryInput.value.trim() === '') {
            deliveryCoords = null;
            validateLocationInput(deliveryInput, deliveryErrorDiv, null);
            checkLocationsConfirmed();
         }
    });

    confirmLocationsBtn.addEventListener('click', function() {
        if (pickupCoords && deliveryCoords) {
            showStep(stepRouteConfirmDiv);
            drawRoute();
        } else {
            alert("Please ensure both pickup and delivery locations are set and valid.");
        }
    });

    editLocationsBtn.addEventListener('click', () => showStep(stepLocationsDiv));
    proceedToReceiverBtn.addEventListener('click', () => showStep(stepReceiverDiv));
    backToRouteBtn.addEventListener('click', () => showStep(stepRouteConfirmDiv));
    proceedToPaymentBtn.addEventListener('click', () => {
        const receiverNameInput = document.getElementById('receiver_name');
        const receiverContactInput = document.getElementById('receiver_contact');
        let isValid = true;
        if (!receiverNameInput.value.trim()) {
            receiverNameInput.classList.add('is-invalid');
            isValid = false;
        } else {
             receiverNameInput.classList.remove('is-invalid');
        }
        if (!receiverContactInput.value.trim()) {
            receiverContactInput.classList.add('is-invalid');
             isValid = false;
        } else {
             receiverContactInput.classList.remove('is-invalid');
        }

        if (isValid) {
            updateReviewDetails();
            showStep(stepPaymentDiv);
        } else {
             alert('Please enter valid receiver name and contact.');
        }
    });
    backToReceiverBtn.addEventListener('click', () => showStep(stepReceiverDiv));

    function showStep(stepToShow) {
        [stepLocationsDiv, stepRouteConfirmDiv, stepReceiverDiv, stepPaymentDiv, stepThankYouDiv].forEach(step => {
            step.style.display = (step === stepToShow) ? 'block' : 'none';
        });
        if (map) {
            map.invalidateSize();
            if (stepToShow === stepRouteConfirmDiv && pickupCoords && deliveryCoords) {
                 map.fitBounds(L.latLngBounds(pickupCoords, deliveryCoords), { padding: [50, 50] });
            } else if (stepToShow === stepLocationsDiv && pickupCoords && deliveryCoords) {
                 map.fitBounds(L.latLngBounds(pickupCoords, deliveryCoords), { padding: [50, 50] });
            } else if (stepToShow === stepLocationsDiv) {
                 map.setView([-1.286389, 36.817223], 13);
            }
        }
    }

    function drawRoute() {
        if (routingControl) {
            map.removeControl(routingControl);
            routingControl = null;
        }
        if (!pickupCoords || !deliveryCoords) return;

        routeInfoDiv.innerHTML = '<div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>Calculating route...';

        routingControl = L.Routing.control({
            waypoints: [pickupCoords, deliveryCoords],
            routeWhileDragging: false,
            addWaypoints: false,
            draggableWaypoints: false,
            lineOptions: { styles: [{ color: '#1abc9c', opacity: 0.8, weight: 6 }] },
            createMarker: () => null,
            show: false,
            router: L.Routing.osrmv1({
                 serviceUrl: 'https://router.project-osrm.org/route/v1'
            })
        })
        .on('routesfound', function(e) {
            var routes = e.routes;
            var summary = routes[0].summary;
            routeInfoDiv.innerHTML = `Estimated Route: <strong>${(summary.totalDistance / 1000).toFixed(1)} km</strong>, approx. <strong>${Math.round(summary.totalTime / 60)} mins</strong>.`;
            setTimeout(() => {
                 if (map && e.routes[0]) {
                    map.fitBounds(e.routes[0].coordinates.map(c => [c.lat, c.lng]), { padding: [50, 50] });
                 }
            }, 100);
        })
        .on('routingerror', function(e) {
             routeInfoDiv.innerHTML = `<span class="text-danger">Could not calculate route. ${e.error?.message || 'Check locations.'}</span>`;
             console.error("Routing Error:", e.error);
        })
        .addTo(map);
    }

     function updateReviewDetails() {
         document.getElementById('review-pickup').textContent = pickupInput.value;
         document.getElementById('review-delivery').textContent = deliveryInput.value;
         document.getElementById('review-receiver-name').textContent = document.getElementById('receiver_name').value;
         document.getElementById('review-receiver-contact').textContent = document.getElementById('receiver_contact').value;
         // const cost = calculateCost(pickupCoords, deliveryCoords);
         // document.getElementById('review-cost').textContent = cost.toFixed(2);
         // document.getElementById('pay-amount').textContent = cost.toFixed(2);
     }

    if (!stripePublishableKey) {
        console.error("Stripe Publishable Key not found. Payment button disabled.");
        if(payButton) payButton.disabled = true;
        const paymentStepDiv = document.getElementById('step-payment');
        if(paymentStepDiv) {
            const errorP = document.createElement('p');
            errorP.className = 'text-danger text-center fw-bold mt-3';
            errorP.textContent = 'Payment gateway is not configured correctly. Please contact support.';
            paymentStepDiv.appendChild(errorP);
        }
    } else {
        var stripeHandler = StripeCheckout.configure({
            key: stripePublishableKey,
            locale: 'auto',
            token: function(token) {
                document.getElementById('pickup_location_final').value = pickupInput.value;
                document.getElementById('delivery_location_final').value = deliveryInput.value;
                document.getElementById('pickup_lat').value = pickupCoords ? pickupCoords.lat : '';
                document.getElementById('pickup_lng').value = pickupCoords ? pickupCoords.lng : '';
                document.getElementById('delivery_lat').value = deliveryCoords ? deliveryCoords.lat : '';
                document.getElementById('delivery_lng').value = deliveryCoords ? deliveryCoords.lng : '';
                document.getElementById('receiver_name_final').value = document.getElementById('receiver_name').value;
                document.getElementById('receiver_contact_final').value = document.getElementById('receiver_contact').value;
                document.getElementById('stripeToken').value = token.id;
                parcelForm.submit();
            }
        });

        if (payButton) {
            payButton.addEventListener('click', function() {
                const receiverName = document.getElementById('receiver_name').value || 'Recipient';
                const paymentAmount = 1000;

                stripeHandler.open({
                    name: 'Suivi',
                    description: `Delivery to ${receiverName}`,
                    amount: paymentAmount,
                    currency: 'usd'
                });
            });
        } else {
             console.error("Payment button not found.");
        }

        window.addEventListener('popstate', function() {
            if (stripeHandler) stripeHandler.close();
        });
    }

    initMap();
    showStep(stepLocationsDiv);

});