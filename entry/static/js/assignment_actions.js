document.addEventListener('DOMContentLoaded', function() {
    // Get data container and read data attributes
    const mapDataElement = document.getElementById('map-data');
    const assignmentId = mapDataElement ? mapDataElement.dataset.assignmentId : null;
    const assignmentStatus = mapDataElement ? mapDataElement.dataset.assignmentStatus : null;

    // Get buttons and container
    const actionButtons = document.getElementById('action-buttons');
    const acceptButton = document.querySelector('.accept-btn');
    const rejectButton = document.querySelector('.reject-btn');
    const pickedUpButton = document.querySelector('.picked-up-btn');
    const deliveredButton = document.querySelector('.delivered-btn');

    // --- Initial Button Visibility ---
    // Only proceed if we have essential elements and an assignment ID/Status
    if (actionButtons && assignmentId && assignmentStatus) {
        // Hide all buttons initially within the container
        acceptButton.style.display = 'none';
        rejectButton.style.display = 'none';
        pickedUpButton.style.display = 'none';
        deliveredButton.style.display = 'none';
        actionButtons.style.display = 'none'; // Hide container initially

        // Show buttons based on the status read from data attribute
        if (assignmentStatus === "allocated") {
            showAcceptRejectButtons();
        } else if (assignmentStatus === "in_progress") {
            showPickedUpButton();
        } else if (assignmentStatus === "shipped") {
            showDeliveredButton();
        }
        // If status is arrived or rejected, container remains hidden
    } else {
         // If no assignment or elements missing, ensure container is hidden
         if(actionButtons) actionButtons.style.display = 'none';
         console.log("No assignment data found or action buttons missing.");
         return; // Stop execution if no assignment data
    }


    // --- Button Event Listeners ---
    // Add null checks for buttons before adding listeners
    if (acceptButton) {
        acceptButton.addEventListener('click', () => {
            updateAssignment('accept');
            // Optimistically update UI, reload happens on success in updateAssignment
            showPickedUpButton();
        });
    }

    if (rejectButton) {
        rejectButton.addEventListener('click', () => {
            updateAssignment('reject');
            // Optimistically update UI
            actionButtons.style.display = 'none';
        });
    }

    if (pickedUpButton) {
        pickedUpButton.addEventListener('click', () => {
            updateAssignment('shipped');
            // Optimistically update UI
            showDeliveredButton();
        });
    }

    if (deliveredButton) {
        deliveredButton.addEventListener('click', () => {
            updateAssignment('arrived');
            // Optimistically update UI
            actionButtons.style.display = 'none';
        });
    }

    // --- Helper Functions ---
    function showAcceptRejectButtons() {
        if (acceptButton) acceptButton.style.display = 'inline-block';
        if (rejectButton) rejectButton.style.display = 'inline-block';
        if (pickedUpButton) pickedUpButton.style.display = 'none';
        if (deliveredButton) deliveredButton.style.display = 'none';
        if (actionButtons) actionButtons.style.display = 'block'; // Show container
    }

    function showPickedUpButton() {
        if (acceptButton) acceptButton.style.display = 'none';
        if (rejectButton) rejectButton.style.display = 'none';
        if (pickedUpButton) pickedUpButton.style.display = 'inline-block';
        if (deliveredButton) deliveredButton.style.display = 'none';
        if (actionButtons) actionButtons.style.display = 'block'; // Show container
    }

    function showDeliveredButton() {
        if (acceptButton) acceptButton.style.display = 'none';
        if (rejectButton) rejectButton.style.display = 'none';
        if (pickedUpButton) pickedUpButton.style.display = 'none';
        if (deliveredButton) deliveredButton.style.display = 'inline-block';
        if (actionButtons) actionButtons.style.display = 'block'; // Show container
    }

    function updateAssignment(action) {
        // Use the assignmentId read from the data attribute
        if (!assignmentId) {
            console.error('Cannot update assignment: ID is missing.');
            return;
        }

        fetch('/update_assignment', { // Ensure this URL is correct
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add CSRF token header if needed by your Flask setup
                // 'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                parcel_id: assignmentId, // Use the variable
                action: action,
            }),
        })
        .then(response => {
            if (!response.ok) {
                // Try to get error details from response body
                return response.json().then(err => { throw new Error(err.error || `HTTP error! Status: ${response.status}`) });
            }
            return response.json();
        })
        .then(data => {
            console.log('Update response:', data);
            if (data.success) {
                // Reload the page to reflect the updated state from the server
                location.reload();
            } else {
                // Display error message to user (e.g., using a flash message system or an alert)
                alert(`Error updating assignment: ${data.error || 'Unknown error'}`);
                console.error('Update failed:', data.error);
                // Optionally revert optimistic UI changes here if needed
            }
        })
        .catch(error => {
            console.error('Fetch Error:', error);
            alert(`Error: ${error.message}`);
            // Optionally revert optimistic UI changes here
        });
    }
});