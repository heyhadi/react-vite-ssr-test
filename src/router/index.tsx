import { Routes, Route } from 'react-router-dom'

import { About, ContactUs, Home } from '../pages'
import Login from '../pages/Login/Login'

import Error from '../components/Error'

export const Router = () => {
  return (
    <Routes>
      <Route index path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/contactUs" element={<ContactUs />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Error statusCode={404} />} />
    </Routes>
  )
}