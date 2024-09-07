import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from "@react-native-community/netinfo";
import { v4 as uuidv4 } from 'uuid';
import md5 from 'md5';
import { Card } from 'react-native-paper';

const SUPABASE_URL = 'https://mjgmkkokxuvcgpocvvvk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qZ21ra29reHV2Y2dwb2N2dnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU2NjMyNDksImV4cCI6MjA0MTIzOTI0OX0.E_is9MNug9yvrHeVMXeiFUoMIYiTCsCAGSAW1ePfzsI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const convertToUUIDv4 = (str) => {
  const hash = md5(str);
  return `${hash.substr(0, 8)}-${hash.substr(8, 4)}-4${hash.substr(13, 3)}-${(parseInt(hash.substr(16, 2), 16) & 0x3f | 0x80).toString(16)}${hash.substr(18, 2)}-${hash.substr(20, 12)}`;
};

const LocationTracker = () => {
  const [errorMsg, setErrorMsg] = useState(null);
  const [locationStatus, setLocationStatus] = useState("Initializing...");
  const [deviceName, setDeviceName] = useState("Unknown Device");
  const [retryCount, setRetryCount] = useState(0);
  const [offlineCount, setOfflineCount] = useState(0);
  const locationRef = useRef(null);
  const deviceIdRef = useRef(null);

  useEffect(() => {
    let intervalId;

    const setupLocationTracking = async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          return;
        }

        const deviceName = Device.deviceName || "Unknown Device";
        setDeviceName(deviceName);

        let deviceId = await AsyncStorage.getItem('deviceId');
        if (!deviceId) {
          deviceId = uuidv4();
          await AsyncStorage.setItem('deviceId', deviceId);
        } else if (!isValidUUID(deviceId)) {
          deviceId = convertToUUIDv4(deviceId);
          await AsyncStorage.setItem('deviceId', deviceId);
        }
        deviceIdRef.current = deviceId;

        const updateAndSendLocation = async () => {
          try {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            console.log("New location received:", location);
            locationRef.current = location;
            setLocationStatus("Location updated: " + new Date(location.timestamp).toLocaleTimeString());
            
            await storeLocationLocally(location, deviceIdRef.current, deviceName);
            await sendLocationToSupabase();
          } catch (error) {
            console.error("Error updating location:", error);
            setErrorMsg('Failed to update location: ' + error.message);
          }
        };

        // Initial update
        await updateAndSendLocation();

        // Set interval for hourly updates
        intervalId = setInterval(updateAndSendLocation, 3600000); 

        // Set up network state listener
        NetInfo.addEventListener(state => {
          if (state.isConnected) {
            sendLocationToSupabase();
          }
        });

        console.log("Hourly location tracking started");
      } catch (error) {
        setErrorMsg('Failed to start location tracking: ' + error.message);
      }
    };

    setupLocationTracking();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  };

  const storeLocationLocally = async (location, deviceId, deviceName) => {
    try {
      const locationData = {
        device_id: deviceId,
        device_name: deviceName,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: location.coords.altitude || null,
        accuracy: location.coords.accuracy || null,
        speed: location.coords.speed || null,
        timestamp: new Date(location.timestamp).toISOString(),
      };

      const storedLocations = await AsyncStorage.getItem('offlineLocations');
      let locations = storedLocations ? JSON.parse(storedLocations) : [];
      locations.push(locationData);
      await AsyncStorage.setItem('offlineLocations', JSON.stringify(locations));
      setOfflineCount(locations.length);
      console.log("Location stored locally");
    } catch (error) {
      console.error('Error storing location locally:', error);
    }
  };

  const sendLocationToSupabase = async () => {
    const storedLocations = await AsyncStorage.getItem('offlineLocations');
    if (!storedLocations) return;

    const locations = JSON.parse(storedLocations);
    if (locations.length === 0) return;

    const { error } = await supabase.from('locations').insert(locations);

    if (error) {
      console.error('Error sending to Supabase:', error);
      setErrorMsg('Failed to send locations to server. Will retry later.');
    } else {
      console.log("All stored locations sent to Supabase successfully");
      await AsyncStorage.removeItem('offlineLocations');
      setOfflineCount(0);
    }
  };

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.title}>Location Tracker Status</Text>
          <View style={styles.infoContainer}>
            <Text style={styles.label}>Status:</Text>
            <Text style={styles.value}>{errorMsg ? errorMsg : locationStatus}</Text>
          </View>
          <View style={styles.infoContainer}>
            <Text style={styles.label}>Device:</Text>
            <Text style={styles.value}>{deviceName}</Text>
          </View>
          <View style={styles.infoContainer}>
            <Text style={styles.label}>Offline Locations:</Text>
            <Text style={styles.value}>{offlineCount}</Text>
          </View>
        </Card.Content>
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  card: {
    elevation: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  infoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
  },
  value: {
    fontSize: 16,
    color: '#007AFF',
  },
});

export default LocationTracker;