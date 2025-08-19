import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/stars')({
  component: StarsComponent,
  beforeLoad: async ({ location }) => {
    // Check authentication by making a request to our session endpoint
    try {
      const response = await fetch('/api/auth/session');
      if (!response.ok) {
        throw new Error('Not authenticated');
      }
      const session = await response.json();
      if (!session?.user) {
        throw new Error('No user session');
      }
    } catch (error) {
      // Redirect to login if not authenticated
      throw redirect({ 
        to: '/login', 
        search: { redirect: location.href } 
      });
    }
  },
})

interface Repo {
  id: string
  name: string
  owner: string
  fullName: string
  description?: string
  stars: number
  language?: string
  lastFetchedAt: string
}

function StarsComponent() {
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'completed' | 'error'>('connecting')

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectToStream = () => {
      try {
        setLoading(true)
        setError(null)
        setConnectionStatus('connecting')

        // Connect to SSE stream
        eventSource = new EventSource('/api/stars/stream')

        eventSource.onopen = () => {
          console.log('SSE connection opened')
          setConnectionStatus('connected')
        }

        eventSource.addEventListener('connected', (event) => {
          console.log('Connected to stream:', event.data)
          setLoading(false)
        })

        eventSource.addEventListener('repo', (event) => {
          const repo = JSON.parse(event.data) as Repo
          console.log('Received repo:', repo.name)
          setRepos(prev => [...prev, repo])
        })

        eventSource.addEventListener('complete', (event) => {
          console.log('Stream completed:', event.data)
          setConnectionStatus('completed')
          setLoading(false)
          eventSource?.close()
        })

        eventSource.onerror = (event) => {
          console.error('SSE error:', event)
          setError('Connection to stream failed')
          setConnectionStatus('error')
          setLoading(false)
          eventSource?.close()
        }

      } catch (err) {
        console.error('Failed to connect to stream:', err)
        setError('Failed to connect to stream')
        setConnectionStatus('error')
        setLoading(false)
      }
    }

    connectToStream()

    // Cleanup on unmount
    return () => {
      eventSource?.close()
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">
            {connectionStatus === 'connecting' && 'Connecting to stream...'}
            {connectionStatus === 'connected' && 'Loading your starred repositories...'}
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Your Starred Repositories
          </h1>

          {repos.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No starred repositories yet
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Start by starring some repositories on GitHub!
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {repos.map((repo) => (
                <div
                  key={repo.id}
                  className="bg-white overflow-hidden shadow rounded-lg"
                >
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-medium text-gray-900 truncate">
                          {repo.name}
                        </h3>
                        <p className="text-sm text-gray-500 truncate">
                          {repo.owner}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <svg
                          className="h-4 w-4 text-yellow-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-sm text-gray-500">
                          {repo.stars}
                        </span>
                      </div>
                    </div>
                    {repo.description && (
                      <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                        {repo.description}
                      </p>
                    )}
                    {repo.language && (
                      <span className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {repo.language}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
