import React from 'react'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import Dashboard from '../views/auth/Dashboard'
import History from '../views/auth/History'
import CrossBorder from '../views/auth/CrossBorder'

const AppRoute = () => {
    return (
        <Router>
            <Routes>
                <Route exact path='/' element={<Dashboard />} />
                <Route exact path='/history' element={<History />} />
                <Route exact path='/crossbordertransfers' element={<CrossBorder />} />
            </Routes>
        </Router>
    )
}

export default AppRoute