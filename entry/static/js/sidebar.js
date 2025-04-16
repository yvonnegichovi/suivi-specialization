document.addEventListener('DOMContentLoaded', (event) => {
    const headerToggle = document.getElementById('header-toggle');
    const navbar = document.getElementById('nav-bar');
    const mainContent = document.querySelector('.assyn');
    const header = document.getElementById('header');

    const toggleSidebar = () => {
        if (navbar && mainContent && header) {
            navbar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
            mainContent.classList.toggle('collapsed');
            header.classList.toggle('expanded');
            header.classList.toggle('collapsed');
        }
    };

    if (navbar && mainContent && header) {
        navbar.classList.remove('collapsed');
        mainContent.classList.add('expanded');
        mainContent.classList.remove('collapsed');
        header.classList.add('expanded');
        header.classList.remove('collapsed');
    }

    if (headerToggle) {
        headerToggle.addEventListener('click', toggleSidebar);
    }
});
