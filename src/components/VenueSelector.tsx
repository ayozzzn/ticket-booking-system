
import { venues } from "../venues";

type VenueSelectorProps = {
  selectedVenue: number | "";
  onVenueChange: (venueId: number | "") => void;
};

export default function VenueSelector({
  selectedVenue,
  onVenueChange,
}: VenueSelectorProps) {
  const venue = venues.find(
    (item) => item.id === selectedVenue
  );

  const mapUrl = venue
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${venue.name}, ${venue.address}`
      )}`
    : "";

  return (
    <div className="venue-selector">
      <label htmlFor="venue">Event Location</label>

      <select
        id="venue"
        value={selectedVenue}
        onChange={(e) =>
          onVenueChange(
            e.target.value === "" ? "" : Number(e.target.value)
          )
        }
      >
        <option value="">Select a location</option>

        {venues.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} — {item.category}
          </option>
        ))}
      </select>

      {venue && (
        <div className="venue-details">
          <h3>{venue.name}</h3>
          <p>{venue.address}</p>
          <p>Category: {venue.category}</p>

          <a href={mapUrl} target="_blank" rel="noopener noreferrer">
            Open in Google Maps
          </a>
        </div>
      )}
    </div>
  );
}
import "./VenueSelector.css";