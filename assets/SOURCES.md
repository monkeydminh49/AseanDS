# Prototype imagery

`ca-mau-basemap.jpg` is a contextual satellite basemap of the Cà Mau peninsula,
retrieved on 11 September 2026 from Esri World Imagery. It is not an image of a
news event and does not have the observation date of the monthly radar data.

Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community.

[Service and attribution](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer)

[Original export](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=104.65,8.55,105.65,9.7&bboxSR=4326&imageSR=3857&size=800,440&format=jpg&f=image)

Other province images are rendered from the geoBoundaries shapes already bundled
in the HTML. News cards display publisher headlines from Google News RSS; these
location images are contextual basemaps, not photographs from those articles.

See [the news feed setup](../news/README.md) for refresh and source details.

## Inspection-map satellite background

`ca-mau-monitor-basemap.jpg` is an Esri World Imagery export retrieved on
11 September 2026, with an exact EPSG:3857 extent in
`ca-mau-monitor-basemap.json`. The source export request is recorded there.
`monitor.js` projects each cell corner into this same extent before rendering
the measured Sentinel-1 water-change overlay. The background date does not
change with the observation-month selector. Visible attribution is retained.
