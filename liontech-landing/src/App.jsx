import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import ScrollCinema from './components/ScrollCinema.jsx'
import QuickSchedule from './components/QuickSchedule.jsx'
import Services from './components/Services.jsx'
import BeforeAfter from './components/BeforeAfter.jsx'
import WhyLionTech from './components/WhyLionTech.jsx'
import Process from './components/Process.jsx'
import Products from './components/Products.jsx'
import Trust from './components/Trust.jsx'
import Location from './components/Location.jsx'
import FinalCTA from './components/FinalCTA.jsx'
import Footer from './components/Footer.jsx'
import WhatsAppFloat from './components/WhatsAppFloat.jsx'

export default function App() {
  return (
    <div className="relative overflow-x-clip">
      <Navbar />
      <main>
        <Hero />
        <ScrollCinema />
        <QuickSchedule />
        <Services />
        <BeforeAfter />
        <WhyLionTech />
        <Process />
        <Products />
        <Trust />
        <Location />
        <FinalCTA />
      </main>
      <Footer />
      <WhatsAppFloat />
    </div>
  )
}
