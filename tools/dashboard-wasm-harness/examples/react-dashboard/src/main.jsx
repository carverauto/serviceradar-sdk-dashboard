import React from "react"
import {mountReactDashboard} from "@serviceradar/dashboard-sdk/react"
import {ExampleDashboard} from "./ExampleDashboard.jsx"

export const mountDashboard = mountReactDashboard(ExampleDashboard)
export default mountDashboard
