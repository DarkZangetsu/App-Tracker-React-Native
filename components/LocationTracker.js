import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from "@react-native-community/netinfo";
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
        // Demande de permission de localisation
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          return;
        }

        const deviceName = Device.deviceName || "Unknown Device";
        setDeviceName(deviceName);

        // Récupération ou génération de l'identifiant de l'appareil
        let deviceId = await AsyncStorage.getItem('deviceId');
        if (!deviceId) {
          deviceId = convertToUUIDv4(deviceName);
          await AsyncStorage.setItem('deviceId', deviceId);
        } else if (!isValidUUID(deviceId)) {
          deviceId = convertToUUIDv4(deviceId);
          await AsyncStorage.setItem('deviceId', deviceId);
        }
        deviceIdRef.current = deviceId;

        const updateAndSendLocation = async () => {
          try {
            // Récupération de la position actuelle
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            console.log("Nouvelle localisation:", location);
            locationRef.current = location;
            setLocationStatus("Location mise à jour: " + new Date(location.timestamp).toLocaleTimeString());
            
            await storeLocationLocally(location, deviceIdRef.current, deviceName);
            await sendLocationToSupabase();
          } catch (error) {
            console.error("Erreur de mise à jour de la localisation:", error);
            setErrorMsg('Échec de mise à jour de la localisation: ' + error.message);
          }
        };

        // Mise à jour initiale
        await updateAndSendLocation();

        // Intervalle pour les mises à jour horaires
        intervalId = setInterval(updateAndSendLocation, 3600000); 

        // Écouteur d'état réseau
        NetInfo.addEventListener(state => {
          if (state.isConnected) {
            sendLocationToSupabase();
          }
        });

        console.log("Suivi de localisation démarré");
      } catch (error) {
        setErrorMsg('Échec du démarrage du suivi: ' + error.message);
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
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
      console.log("Localisation stockée localement");
    } catch (error) {
      console.error('Erreur de stockage local:', error);
    }
  };

  const sendLocationToSupabase = async () => {
    const storedLocations = await AsyncStorage.getItem('offlineLocations');
    if (!storedLocations) return;

    const locations = JSON.parse(storedLocations);
    if (locations.length === 0) return;

    const { error } = await supabase.from('locations').insert(locations);

    if (error) {
      console.error('Erreur d\'envoi vers Supabase:', error);
      setErrorMsg('Échec de l\'envoi des localisations. Réessayer plus tard.');
    } else {
      console.log("Toutes les localisations envoyées à Supabase");
      await AsyncStorage.removeItem('offlineLocations');
      setOfflineCount(0);
    }
  };

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.title}>Statut du Suivi de Localisation</Text>
          <View style={styles.infoContainer}>
            <Text style={styles.label}>Statut:</Text>
            <Text style={styles.value}>{errorMsg ? errorMsg : locationStatus}</Text>
          </View>
          <View style={styles.infoContainer}>
            <Text style={styles.label}>Appareil:</Text>
            <Text style={styles.value}>{deviceName}</Text>
          </View>
          <View style={styles.infoContainer}>
            <Text style={styles.label}>Localisations hors-ligne:</Text>
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
