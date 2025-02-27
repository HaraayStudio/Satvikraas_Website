import React, { useState, useEffect } from "react";
import "./checkout.css";
import CartItemRow from "./CartItemRow";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const api = axios.create({
  baseURL: "https://api.satvikraas.com",
  withCredentials: true,
  validateStatus: (status) => {
    return (status >= 200 && status < 300) || status === 302;
  },
});
const getAccessToken = () => {
  return sessionStorage.getItem("accessToken");
};

const API_URL = "https://api.satvikraas.com/api/razorpay";

export const createOrder = async (
  items,
  selectedAddress,
  needToSave,
  totalAmount
) => {
  const accessToken = getAccessToken();

  console.log("in createOrder");
  console.log("item=s" + items);
  console.log("selectedAddress" + selectedAddress);
  console.log("needToSave" + needToSave);
  console.log("totalAmount" + totalAmount);

  // Prepare the request payload
  const requestPayload = {
    items: items.map((item) => ({
      quantity: item.quantity,
      productVariant: {
        id: item.productVariantDTO.id,
        price: item.productVariantDTO.price,
        discount: item.productVariantDTO.discount,
        weight: item.productVariantDTO.weight,
        finalPrice: item.productVariantDTO.finalPrice,
      },
    })),
    selectedAddress: {
      ...selectedAddress,
      // Ensure all properties are included
      id: selectedAddress.id || 0,
      name: selectedAddress.name || "",
      phone: selectedAddress.phone || "",
      postalCode: selectedAddress.postalCode || "",
      street: selectedAddress.street || "",
      city: selectedAddress.city || "",
      state: selectedAddress.state || "",
      country: selectedAddress.country || "",
      addressType: selectedAddress.addressType || "",
      isDefault: selectedAddress.isDefault || false,
      landmark: selectedAddress.landmark || "",
    },
    needToSave,
    totalAmount,
  };

  try {
    const response = await api.post(
      `/api/razorpay/createorder`,
      requestPayload, // Empty body for a POST request with query parameters
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const completeOrder = async (orderId) => {
  const accessToken = getAccessToken();
  try {
    const response = await axios.post(
      `${API_URL}/complete`,
      {}, // Empty body for a POST request with query parameters
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          orderId: orderId,
        }, // Add query parameters here
      }
    );
    return response.data;
  } catch (error) {
    throw error;
  }
};

const CheckoutPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [notAddressCardClick, setNotAddressCardClick] = useState(true);
  const [items, setItem] = useState(location.state.items);
  const [currentStep, setCurrentStep] = useState("products");
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notification, setNotification] = useState("");
  const [newAddress, setNewAddress] = useState({
    name: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    country: "",
    pincode: "", // Changed from pincode to match backend
    landmark: "",
    addressType: "", // Default value
    isDefault: false,
  });

  const [isModalOpen, setModalOpen] = useState(false);
  const [btnName, setBtnName] = useState("Add New Address");
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [paymentPlatFormCharge, setPaymentPlatFormCharge] = useState(0);
  const [isAddressServiceable, setIsAddressServiceable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [subtotal, setSubTotal] = useState(0);
  const [needToSave, setNeedToSave] = useState(false);

  const handleError = (error) => {
    if (error.response) {
      setError(error.response.data.message || "Failed to complete operation");
    } else if (error.request) {
      setError("Server not responding. Please try again.");
    } else {
      setError("Operation failed. Please try again.");
    }
  };

  const getAccessToken = () => {
    return sessionStorage.getItem("accessToken");
  };

  const countSubtotal = () => {
    // Check if items array is empty or null
    if (!items || items.length === 0) {
      setSubTotal(0);
      return 0;
    }

    // Calculate subtotal considering price, quantity, and offer end date
    const subtotal = items.reduce((acc, item) => {
      // Check if item and its product variant are valid
      if (!item || !item.productVariantDTO || !item.quantity) {
        return acc;
      }

      // Get current date
      const currentDate = new Date();

      // Check if offer is still valid
      const offerEndDate = item.productVariantDTO.offerEndDate
        ? new Date(item.productVariantDTO.offerEndDate)
        : null;

      // Determine the price to use
      let effectivePrice = item.productVariantDTO.price || 0;

      // Apply discount if offer is still valid
      if (offerEndDate && currentDate <= offerEndDate) {
        const discount = item.productVariantDTO.discount || 0;
        effectivePrice *= 1 - discount / 100;
      }

      // Calculate line item total
      const lineItemTotal = effectivePrice * item.quantity;

      // Add to accumulator
      return acc + lineItemTotal;
    }, 0);

    // Update subtotal state
    setSubTotal(subtotal);
    return subtotal;
  };
  useEffect(() => {
    getDeliveryCharges(selectedAddress.postalcode);
    const totalAmount = subtotal + deliveryCharge;
    const platformChargeRate = 0.02; // 2% platform charge
    const gstRate = 0.18; // 18% GST

    // Calculate Platform Charge and round to nearest integer
    const platformCharge = Math.round(totalAmount * platformChargeRate);

    // Calculate GST on Platform Charge and round to nearest integer
    const gstAmount = Math.round(platformCharge * gstRate);

    // Total Platform Charge and round to nearest integer
    const totalPlatformCharge = platformCharge + gstAmount;

    setPaymentPlatFormCharge(totalPlatformCharge);
  }, [subtotal, deliveryCharge]);

  useEffect(() => {
    // Recalculate subtotal whenever items change
    countSubtotal();
  }, [items]);

  useEffect(() => {
    loadRazorpayScript();
    const fetchAddresses = async () => {
      try {
        const accessToken = getAccessToken();

        if (!accessToken) {
          alert("Please login to buy product");
          navigate("/login");
        }

        const response = await api.get("/api/user/getAddresses", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        console.log(response);
        if (response.data?.data) {
          setAddresses(response.data.data);
        } else {
          setAddresses([]);
        }
      } catch (error) {
        console.error("Error fetching cart:", error);
      } finally {
        setLoading(false);
      }
    };
    countSubtotal();
    fetchAddresses();
  }, []);

  const calculateTotalWeight = (items) => {
    return items.reduce((total, item) => {
      // Safely calculate weight, multiply by quantity
      return total + item.productVariantDTO.weight * item.quantity;
    }, 0);
  };

  const getDeliveryCharges = async (pincode) => {
    const weight = calculateTotalWeight(items);
    console.log(weight);
    const getDeliveryChargesResponse = await fetch(
      `https://api.satvikraas.com/api/delhiveryOne/getDeliveryCharges?destinationPincode=${pincode}&weight=${weight}`
    );

    if (getDeliveryChargesResponse.ok) {
      const deliveryChargesData = await getDeliveryChargesResponse.json();
      console.log(deliveryChargesData);

      // Use the actual delivery charge from the response or fallback to 99
      console.log(
        "delhivery charge =" + deliveryChargesData.responses[0].total_amount
      );
      setDeliveryCharge(deliveryChargesData.responses[0].total_amount);
    }
  };

  const checkServiceability = async (pincode) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://api.satvikraas.com/api/delhiveryOne/checkServiceability?pincode=${pincode}`
      );

      console.log("response", response);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Serviceability check failed");
      }

      const data = await response.json();
      console.log("data", data);

      const isServiceable = data.serviceable;

      setIsAddressServiceable(isServiceable);

      if (isServiceable) {
        const getDeliveryChargesResponse = getDeliveryCharges(pincode);

        if (notAddressCardClick) {
          setNewAddress((prevAddress) => ({
            ...prevAddress,

            state: data.details.location.state,
            city: data.details.location.city,
          }));
        } else {
          setNewAddress((prevAddress) => ({
            ...prevAddress,
            pincode: "",
            state: "",
            city: "",
          }));
        }
      } else {
        setIsAddressServiceable(false);
        setNewAddress((prevAddress) => ({
          ...prevAddress,
          state: "",
          city: "",
        }));
      }
    } catch (error) {
      console.error("Error checking serviceability:", error);
      setIsAddressServiceable(false);
      // Optionally: show error to user
      // setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayment = async () => {
    try {
      console.log("in handle payment");

      const totalAmount = subtotal + deliveryCharge + paymentPlatFormCharge;

      // Create order in backend
      const orderData = await createOrder(
        items,
        selectedAddress,
        needToSave,
        totalAmount
      );

      console.log(orderData);
      const options = {
        key: "rzp_test_YH8zCfwQrn8l5q",
        amount: totalAmount * 100, // Amount in paise
        currency: "INR",
        name: "SATVIK RASS",
        description: "Purchase Description",
        order_id: orderData.id,
        handler: async function (response) {
          const accessToken = getAccessToken();
          const completeOrderResponse = await api.put(
            "/api/razorpay/completeOrder",
            null,
            {
              params: {
                orderId: response.razorpay_order_id,
              },
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );
          console.log("completeOrderResponse" + completeOrderResponse);
          // if(completeOrderResponse)
          alert("Payment Successful!");
        },
        prefill: {
          name: selectedAddress.name,
          // email: 'customer@example.com',
          contact: selectedAddress.phone,
        },
        theme: {
          color: "#3399cc",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      console.error("Payment failed:", error);
      alert("Payment failed!");
    }
  };

  const handlemodelopen = () => {
    if (isModalOpen) {
      setBtnName("Add New Address");
      setNewAddress({
        name: "",
        phone: "",
        pincode: "",
        street: "",
        city: "",
        state: "",
      });
    } else setBtnName("close");
    setModalOpen(!isModalOpen);
  };

  const handleUseAddress = () => {
    const transformedAddress = {
      name: newAddress.name,
      phone: newAddress.phone,
      postalCode: newAddress.pincode,
      street: newAddress.street,
      city: newAddress.city,
      state: newAddress.state,
      country: newAddress.country,
      addressType: newAddress.addressType,
      isDefault: false,
      landmark: newAddress.landmark,
    };

    setSelectedAddress(transformedAddress);
    setNeedToSave(true);
    // setModalOpen(false);
  };
  const manageSetSelectedAddress = (address) => {
    setSelectedAddress(address);
    setNeedToSave(false);
    // setModalOpen(false);
  };

  const handleSaveAddress = async () => {
    if (isAddressServiceable) {
      const transformedAddress = {
        name: newAddress.name,
        phone: newAddress.phone,
        postalCode: newAddress.pincode,
        street: newAddress.street,
        city: newAddress.city,
        state: newAddress.state,
        country: "india",
        addressType: "HOME",
        isDefault: false,
        landmark: newAddress.landmark,
      };
      const accessToken = getAccessToken();

      const response = await axios.post(
        "https://api.satvikraas.com/api/user/saveAddress",
        transformedAddress,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (response.ok) alert("address added successfully");
    }
  };
  const fetchCartItems = async () => {
    try {
      const accessToken = getAccessToken();

      if (!accessToken) {
        setError("Please login to view cart");
        return;
      }

      const response = await api.get("/api/user/getUserCart", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.data?.data) {
        setItem(response.data.data);
        countSubtotal();
        setError("");
      } else {
        setItem([]);
        countSubtotal();
      }
    } catch (error) {
      console.error("Error fetching cart:", error);
      handleError(error);
    } finally {
      setLoading(false);
    }
  };
  const showNotification = (message) => {
    setNotification(message);
  };

  const updateQuantity = async (cartItemId, newQuantity) => {
    try {
      if (newQuantity < 1) return;

      const accessToken = getAccessToken();

      await api.put("/api/user/updateCartItemQuantity", null, {
        params: {
          cartItemId: cartItemId,
          newQuantity: newQuantity,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      await fetchCartItems();

      showNotification(`quantity Updated`);
    } catch (error) {
      console.error("Error updating quantity:", error);
      handleError(error);
    }
  };

  const removeItem = async (cartItemId) => {
    try {
      const accessToken = getAccessToken();

      await api.put("/api/user/deletecartItem", null, {
        params: {
          cartItemId: cartItemId,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      await fetchCartItems();

      showNotification(`Removed item from cart`);
    } catch (error) {
      console.error("Error removing item:", error);
      handleError(error);
    }
  };

  return (
    <div className="checkout-container">
      <div className="progress-steps">
        <div
          className={`step ${
            currentStep === "products" ? "active" : ""
          }} onClick={() => setCurrentStep('products')`}
        >
          <div className="step-icon icon-package"></div>
          <span>Ordered Products</span>
        </div>

        <div
          className={`step ${
            currentStep === "address" ? "active" : ""
          }} onClick={items && items.length > 0 ? () => setCurrentStep('address') : undefined`}
        >
          <div className="step-icon icon-location"></div>
          <span>Delivery Address</span>
        </div>
        <div className={`step ${currentStep === "payment" ? "active" : ""}`}>
          <div className="step-icon icon-payment"></div>
          <span>Payment</span>
        </div>
      </div>

      {currentStep === "products" && (
        <div>
          {" "}
          <div className="header-grid">
            <div className="header-col-span"></div>
            <div className="header-text center-align">Quantity</div>
            <div className="header-flex">
              <div className="header-text">Action</div>
              <div className="header-text">Total</div>
            </div>
          </div>
          {items.map((cartItem, i) => (
            <CartItemRow
              key={i}
              cartItem={cartItem}
              updateQuantity={updateQuantity}
              removeItem={removeItem}
            />
          ))}
          <div className="text-right">
            <p className="price-info">
              Subtotal:<span> ₹{subtotal}</span>
            </p>

            {items && items.length > 0 && (
              <button
                onClick={() => setCurrentStep("address")}
                className="checkoutbtn"
              >
                NEXT
              </button>
            )}
          </div>
        </div>
      )}

      {currentStep === "address" && (
        <div>
          <h3 className="section-title">Saved Addresses</h3>
          <div className="savedaddresshead">
            {addresses.map((address) => (
              <div
                key={address.id}
                className={`address-card ${
                  selectedAddress?.id === address.id ? "selected" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent event bubbling
                  manageSetSelectedAddress(address);
                  checkServiceability(address.postalCode);
                  setNotAddressCardClick(false);
                }}
              >
                <h3>{address.addressType}</h3>
                <h4>{address.postalCode}</h4>
                <p>{address.street}</p>
                <p>
                  {address.city}, {address.state} - {address.country}
                </p>
                <p>{address.landmark}</p>
              </div>
            ))}
          </div>

          <div>
            <button onClick={handlemodelopen}>{btnName}</button>
            {isModalOpen && (
              <div>
                <input
                  type="text"
                  placeholder="Name"
                  className="input-field"
                  value={newAddress.name}
                  onChange={(e) =>
                    setNewAddress({ ...newAddress, name: e.target.value })
                  }
                />
                <input
                  type="number"
                  placeholder="Contact Number"
                  className="input-field"
                  value={newAddress.phone}
                  onChange={(e) =>
                    setNewAddress({ ...newAddress, phone: e.target.value })
                  }
                />

                <input
                  type="text"
                  placeholder="Pincode"
                  className="input-field"
                  maxLength={6}
                  value={newAddress.pincode}
                  onChange={(e) => {
                    const inputPincode = e.target.value;
                    // Only allow numeric input
                    const numericPincode = inputPincode.replace(/\D/g, "");

                    setNewAddress({
                      ...newAddress,
                      pincode: numericPincode,
                      // Reset city and state if pincode is not exactly 6 digits
                      ...(numericPincode.length !== 6 && {
                        city: "",
                        state: "",
                      }),
                    });

                    // Trigger serviceability check only when exactly 6 digits
                    if (numericPincode.length === 6) {
                      setNotAddressCardClick(true);
                      checkServiceability(numericPincode);
                    } else {
                      setIsAddressServiceable(false);
                    }
                  }}
                />

                <input
                  type="text"
                  placeholder="Street Address"
                  className="input-field"
                  value={newAddress.street}
                  onChange={(e) =>
                    setNewAddress({ ...newAddress, street: e.target.value })
                  }
                />
                <input
                  type="text"
                  placeholder="City"
                  className="input-field"
                  value={newAddress.city}
                  onChange={(e) =>
                    setNewAddress({ ...newAddress, city: e.target.value })
                  }
                />
                <input
                  type="text"
                  placeholder="State"
                  className="input-field"
                  value={newAddress.state}
                  onChange={(e) =>
                    setNewAddress({ ...newAddress, state: e.target.value })
                  }
                />
              </div>
            )}
            {isAddressServiceable && newAddress.pincode && (
              <button onClick={() => handleUseAddress()}>
                USE THIS ADDRESS
              </button>
            )}
            {/* 
{isAddressServiceable && newAddress.pincode && (
             <button onClick={() => handleSaveAddress()}>SAVE ADDRESS</button>
            )}  */}
          </div>

          {isLoading ? (
            <div className="text-center">Checking delivery availability...</div>
          ) : (
            !isAddressServiceable && (
              <div className="alert-error">
                Sorry, delivery is not available at this location
              </div>
            )
          )}

          {(selectedAddress || newAddress.pincode) && isAddressServiceable && (
            <div className="text-right">
              <p className="price-info">Delivery Charge: ₹{deliveryCharge}</p>
              <p className="price-info">Total: ₹{subtotal + deliveryCharge}</p>
              <button
                onClick={() => setCurrentStep("payment")}
                className="button"
              >
                Proceed to Payment
              </button>
            </div>
          )}
          <button onClick={() => setCurrentStep("products")} className="button">
            back
          </button>
        </div>
      )}

      {currentStep === "payment" && (
        <div>
          <div className="summary-section">
            <h3 className="section-title">Order Summary</h3>
            <div>
              <p>Subtotal: ₹{subtotal}</p>
              <p>Delivery Charge: ₹{deliveryCharge}</p>
              <p>Payment Platform Charge: ₹{paymentPlatFormCharge}</p>
              <p className="price-info">
                Total: ₹{subtotal + deliveryCharge + paymentPlatFormCharge}
              </p>
            </div>
          </div>
          <button
            onClick={handlePayment}
            className="button"
            style={{ width: "100%", marginTop: "1rem" }}
          >
            Pay Now
          </button>
        </div>
      )}
    </div>
  );
};

export default CheckoutPage;
