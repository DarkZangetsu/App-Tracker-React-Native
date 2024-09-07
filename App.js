import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from './screens/HomeScreen';
import LocationTracker from './components/LocationTracker';

const Stack = createStackNavigator();

const App = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'GPS Tracker Pro' }}
        />
      </Stack.Navigator>
      <LocationTracker />
    </NavigationContainer>
  );
};

export default App;