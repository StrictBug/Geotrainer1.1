document.addEventListener('DOMContentLoaded', function() {
    // Initialize checkbox dropdowns
    initCheckboxDropdowns();

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        const dropdowns = document.querySelectorAll('.checkbox-dropdown');
        dropdowns.forEach(dropdown => {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });
    });
});

function initCheckboxDropdowns() {
    const dropdowns = document.querySelectorAll('.checkbox-dropdown');
    
    dropdowns.forEach(dropdown => {
        const header = dropdown.querySelector('.selected-options');
        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
        
        // Toggle dropdown on clicking the header or the dropdown itself
        dropdown.addEventListener('click', (e) => {
            // Don't toggle if clicking a checkbox
            if (e.target.type === 'checkbox') return;
            
            e.stopPropagation();
            dropdowns.forEach(d => {
                if (d !== dropdown) d.classList.remove('active');
            });
            dropdown.classList.toggle('active');
        });

        // Handle checkbox changes
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent dropdown from closing
                
                const isAll = checkbox.value === 'All regions' || checkbox.value === 'all';
                const isAllTypes = checkbox.value === 'all';
                const isMafc = checkbox.value === 'MAFC';
                const isBafc = checkbox.value === 'BAFC';
                const mafcAreas = ['WA-S', 'SA', 'NSW-W', 'VIC', 'TAS'];
                const bafcAreas = ['WA-N', 'NT', 'QLD-N', 'QLD-S', 'NSW-E'];
                
                const allOption = Array.from(checkboxes).find(cb => 
                    cb.value === 'All regions' || cb.value === 'all'
                );

                if (isAll) {
                    // When "All" is selected or unselected
                    checkboxes.forEach(cb => {
                        if (cb !== checkbox) {
                            cb.checked = false; // Uncheck all other options
                            cb.disabled = false; // Always keep options enabled for both "All types" and "All regions"
                        }
                    });
                } else if (checkbox.checked) {
                    // Uncheck "All" when selecting anything else
                    if (allOption) {
                        allOption.checked = false;
                        allOption.disabled = false;
                    }

                    if (isMafc) {
                        // When selecting MAFC, only affect MAFC areas
                        checkboxes.forEach(cb => {
                            if (mafcAreas.includes(cb.value)) {
                                cb.checked = false;
                                cb.disabled = true;
                            }
                        });
                    } else if (isBafc) {
                        // When selecting BAFC, only affect BAFC areas
                        checkboxes.forEach(cb => {
                            if (bafcAreas.includes(cb.value)) {
                                cb.checked = false;
                                cb.disabled = true;
                            }
                        });
                    }
                } else {
                    // When unchecking an option
                    if (isMafc) {
                        // When unchecking MAFC, only enable MAFC areas
                        checkboxes.forEach(cb => {
                            if (mafcAreas.includes(cb.value)) {
                                cb.disabled = false;
                            }
                        });
                    } else if (isBafc) {
                        // When unchecking BAFC, only enable BAFC areas
                        checkboxes.forEach(cb => {
                            if (bafcAreas.includes(cb.value)) {
                                cb.disabled = false;
                            }
                        });
                    } else if (isAll) {
                        // When unchecking "All", enable everything
                        checkboxes.forEach(cb => {
                            cb.disabled = false;
                            cb.checked = false;
                        });
                    }
                }
                
                updateSelectedOptions(dropdown);
                
                // If this is a multiplayer dropdown and we're the host, update game settings
                if ((dropdown.id === 'mp-area' || dropdown.id === 'mp-locationType') && 
                    typeof updateGameSettings === 'function' && 
                    window.isHost) {
                    updateGameSettings();
                }
            });
        });
    });
}

function updateSelectedOptions(dropdown) {
    const selectedOptions = Array.from(dropdown.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => cb.value);
    
    const header = dropdown.querySelector('.selected-options');
    const allOption = dropdown.querySelector('input[value="All regions"], input[value="all"]');
    
    if (selectedOptions.length === 0) {
        // If nothing is selected, select "All"
        if (allOption) {
            allOption.checked = true;
            header.textContent = allOption.value === 'all' ? 'All types' : allOption.value;
        }
    } else if (selectedOptions.includes('All regions') || selectedOptions.includes('all')) {
        // If "All" is selected, show appropriate text
        header.textContent = allOption.value === 'all' ? 'All types' : allOption.value;
    } else {
        // Show selected options
        header.textContent = selectedOptions.join(', ');
    }
}

// Function to get selected areas
function getSelectedAreas() {
    const checkboxes = document.querySelectorAll('#sp-area input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// Function to get selected location types
function getSelectedLocationTypes() {
    const checkboxes = document.querySelectorAll('#sp-locationType input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}