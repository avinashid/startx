import axios from "axios";
import { z } from "zod";
import { ITool } from "../i-tool.js";
import type { ToolReturn } from "../types.js";

async function findCoordinates(location: string) {
	const geoRes = await axios.get("https://geocoding-api.open-meteo.com/v1/search", {
		params: { name: location, count: 1 },
	});

	const geoData = geoRes.data;
	if (!geoData.results?.length) {
		return null;
	}

	const { latitude, longitude } = geoData.results[0];
	return { latitude, longitude };
}

export const WeatherTools: ITool[] = [
	new ITool({
		title: "get_forecast",
		description: "Returns the 1-day weather forecast for a given location.",
		schema: z.object({
			location: z.string().describe("Location name, city, or place."),
		}),
		run: async props => {
			try {
				const coords = await findCoordinates(props.location);

				if (!coords) {
					return [
						{
							type: "text",
							text: `Could not find location: ${props.location}`,
						},
						{
							type: "resource_link",
							uri: "return",
							name: "Location not found",
							_meta: {
								return: {
									isCompleted: false,
									isError: true,
								},
							},
						},
					];
				}

				const weatherRes = await axios.get("https://api.open-meteo.com/v1/forecast", {
					params: {
						latitude: coords.latitude,
						longitude: coords.longitude,
						daily: "weathercode,temperature_2m_max,temperature_2m_min",
						timezone: "auto",
					},
				});

				const forecast = weatherRes.data.daily;

				const text = `Forecast for ${props.location}:
					- Max Temp: ${forecast.temperature_2m_max[0]}°C
					- Min Temp: ${forecast.temperature_2m_min[0]}°C
					- Weather Code: ${forecast.weathercode[0]}`;
				const response: ToolReturn = [
					{
						type: "text",
						text,
					},
				];

				return response;
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return [
					{ type: "text", text: `Error fetching forecast: ${message}` },
					{
						type: "resource_link",
						uri: "return",
						name: "Forecast error",
						_meta: {
							return: {
								isCompleted: true,
								isError: true,
							},
						},
					},
				];
			}
		},
	}),

	new ITool({
		title: "current_temperature",
		description: "Returns current temperature in Celsius.",
		schema: z.object({
			city: z.string().describe("City name."),
		}),
		run: async ({ city }) => {
			try {
				const coords = await findCoordinates(city);

				if (!coords) {
					return [
						{
							type: "text",
							text: `Could not find city: ${city}`,
						},
						{
							type: "resource_link",
							uri: "return",
							name: "City not found",
							_meta: {
								return: {
									isCompleted: true,
									isError: true,
								},
							},
						},
					];
				}

				const weatherRes = await axios.get("https://api.open-meteo.com/v1/forecast", {
					params: {
						latitude: coords.latitude,
						longitude: coords.longitude,
						current_weather: true,
						timezone: "auto",
					},
				});

				const temperature = weatherRes.data.current_weather?.temperature;

				const text = `The current temperature in ${city} is ${temperature}°C.`;
				const response: ToolReturn = [
					{
						type: "text",
						text,
					},
				];

				return response;
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return [
					{ type: "text", text: `Error fetching temperature: ${message}` },
					{
						type: "resource_link",
						uri: "return",
						name: "Temperature error",
						_meta: {
							return: {
								isCompleted: false,
								isError: true,
							},
						},
					},
				];
			}
		},
	}),

	new ITool({
		title: "convert_temperature",
		description: "Converts a temperature between Celsius and Fahrenheit.",
		schema: z.object({
			value: z.number().describe("Temperature value."),
			to: z.enum(["celsius", "fahrenheit"]).describe("Target unit."),
		}),
		run: ({ value, to }: { value: number; to: "celsius" | "fahrenheit" }) => {
			try {
				let result: string;

				if (to === "celsius") {
					const c = ((value - 32) * 5) / 9;
					result = `${value}°F is ${c.toFixed(2)}°C`;
				} else {
					const f = (value * 9) / 5 + 32;
					result = `${value}°C is ${f.toFixed(2)}°F`;
				}

				return [
					{ type: "text", text: result },
					{
						type: "resource_link",
						uri: "return",
						name: "Conversion completed",
						_meta: {
							return: {
								isCompleted: true,
								isError: false,
							},
						},
					},
				];
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return [
					{ type: "text", text: `Error converting temperature: ${message}` },
					{
						type: "resource_link",
						uri: "return",
						name: "Conversion error",
						_meta: {
							return: {
								isCompleted: true,
								isError: true,
							},
						},
					},
				];
			}
		},
	}),
];
