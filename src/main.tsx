import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import App from './App'
import Profile from './routes/Profile.tsx'
import RequireAuth from './routes/RequireAuth.tsx'

const router = createBrowserRouter([
	{ path: '/', element: <App /> },
	{
		path: '/profile',
		element: (
			<RequireAuth>
				<Profile />
			</RequireAuth>
		)
	},
	{ path: '*', element: <Navigate to="/" replace /> }
])

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
