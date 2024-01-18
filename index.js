import got from "got";

const token = "YOUR_ACCESS_TOKEN";

// an empty array is equal to all sites
// a populated array will limit to just those sites
const target_locations = ["Site1", "Site3"];

const options = {
  prefixUrl: "https://webexapis.com/v1",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
};

const got_client = got.extend(options);

const pagination = {
  transform: (res) => JSON.parse(res.body).phoneNumbers,
  filter: ({ item }) =>
    item.owner?.type && ["PEOPLE", "PLACE"].includes(item.owner.type),
};

const numbers = got_client.paginate("telephony/config/numbers", { pagination });

const locations_cache = {};
const is_location_eligible = async (number) => {
  if (target_locations.length === 0) return true;

  if (number.owner.type === "PLACE")
    return target_locations.includes(number.location.name);

  const { locationId } = await got_client(
    `people/${number.owner.id}?callingData=true`
  ).json();
  if (!(locationId in locations_cache)) {
    const { name } = await got_client(`locations/${locationId}`).json();
    if (target_locations.includes(name)) locations_cache[locationId] = name;
  }

  return locationId in locations_cache;
};

for await (const number of numbers) {
  if (!(await is_location_eligible(number))) continue;

  got_client(
    `telephony/config/${
      number.owner.type === "PEOPLE" ? "people" : "workspaces"
    }/${number.owner.id}/devices`
  )
    .json()
    .then(({ devices }) => {
      for (const device of devices) {
        if (!device.primaryOwner || /RoomOS/.test(device.model)) continue;
        got_client
          .post(
            `telephony/config/devices/${device.id}/actions/applyChanges/invoke`
          )
          .then((_) =>
            console.log(
              `applied config to ${device.owner.firstName}'s ${device.model}`
            )
          );
      }
    });
}
