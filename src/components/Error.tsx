// Libraries imports
import { useState, useEffect } from 'react'

// This component is displayed when the end-user navigates to a non-existent page.
export interface ErrorProps {
  statusCode?: number
}

function Error({ statusCode }: ErrorProps) {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  if (!hydrated) {
    return null
  }

  return (
    <div>
      <code>Error {statusCode}</code>
    </div>
  )
}

export default Error
