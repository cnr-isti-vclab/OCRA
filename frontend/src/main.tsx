import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import App from './App'
import Profile from './routes/Profile.tsx'
import AuditLog from './routes/AuditLog.tsx'
import RequireAuth from './routes/RequireAuth.tsx'

/**
 * SINGLE PAGE APPLICATIONS (SPAs)
 * 
 * A Single Page Application is a web application that loads a single HTML page
 * and dynamically updates content as the user interacts with the app, without
 * requiring full page reloads from the server.
 * 
 * Traditional Multi-Page Apps vs SPAs:
 * 
 * TRADITIONAL (Multi-Page):
 * - Each URL corresponds to a separate HTML file on the server
 * - Clicking a link triggers a full page request to the server
 * - Server sends back a complete new HTML page
 * - Browser replaces entire page content (white flash, loss of state)
 * - Example: user goes from /home.html to /about.html → server request
 * 
 * SINGLE PAGE APPLICATIONS:
 * - One HTML file is loaded initially with a JavaScript bundle
 * - All navigation happens client-side using JavaScript
 * - Content is updated by manipulating the DOM dynamically
 * - URL changes are handled by the browser's History API (no server requests)
 * - Example: user goes from /home to /about → JavaScript swaps components
 * 
 * SPA Benefits:
 * - Faster navigation (no page reloads)
 * - Smooth user experience (no white flashes)
 * - Reduced server load (fewer requests)
 * - App-like feel with persistent state
 * - Better performance after initial load
 * 
 * SPA Challenges:
 * - Larger initial bundle size
 * - SEO complexity (solved by SSR/SSG)
 * - Browser history management (solved by React Router)
 * - Initial load time can be slower
 * 
 * This React app is a perfect example of an SPA - notice how clicking between
 * home and profile pages doesn't trigger a full page reload!
 */

/**
 * REACT ROUTER SETUP
 * 
 * React Router enables client-side routing in single-page applications (SPAs).
 * Instead of traditional server-side routing where each URL triggers a new page request,
 * React Router handles navigation entirely in the browser using the History API.
 * 
 * Key concepts:
 * - Routes: URL patterns that map to React components
 * - Browser Router: Uses HTML5 history API for clean URLs (no hash fragments)
 * - Navigation: Changes URL and renders different components without page refresh
 * - Route Guards: Components that control access to certain routes (like RequireAuth)
 */

const router = createBrowserRouter([
	// Root route: renders the main App component at "/"
	{ path: '/', element: <App /> },
	
	// Protected route: requires authentication to access
	// The RequireAuth wrapper component checks if user is logged in
	// If not authenticated, it redirects to home page
	// If authenticated, it renders the Profile component
	{
		path: '/profile',
		element: (
			<RequireAuth>
				<Profile />
			</RequireAuth>
		)
	},
	
	// Protected audit log route: shows user's login/logout history
	{
		path: '/audit',
		element: (
			<RequireAuth>
				<AuditLog />
			</RequireAuth>
		)
	},
	
	// Catch-all route: any unmatched paths redirect to home
	// The "*" wildcard matches any route not defined above
	// <Navigate> programmatically redirects to "/" with "replace" 
	// (replaces current history entry instead of adding new one)
	{ path: '*', element: <Navigate to="/" replace /> }
])

// Render the router provider which enables routing throughout the app
// RouterProvider makes the router available to all child components
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
