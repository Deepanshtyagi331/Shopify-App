import { useState, useEffect } from "react";
import {
  Card,
  Page,
  Layout,
  FormLayout,
  TextField,
  Button,
  DataTable,
  Badge,
  TextContainer,
  Banner,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

export default function HomePage() {
  const shopify = useAppBridge();

  const [announcementText, setAnnouncementText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [auditHistory, setAuditHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Fetch the active announcement and audit log on mount
  useEffect(() => {
    fetchCurrentAnnouncement();
    fetchAuditHistory();
  }, []);

  const fetchCurrentAnnouncement = async () => {
    try {
      const response = await fetch("/api/announcement/current");
      if (response.ok) {
        const data = await response.json();
        setAnnouncementText(data.text || "");
      }
    } catch (err) {
      console.error("Error fetching current announcement:", err);
    }
  };

  const fetchAuditHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch("/api/announcement/history");
      if (response.ok) {
        const data = await response.json();
        setAuditHistory(data.history || []);
      }
    } catch (err) {
      console.error("Error fetching audit history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSave = async () => {
    if (announcementText.trim() === "") {
      shopify.toast.show("Announcement text cannot be empty.", { isError: true });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/announcement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: announcementText }),
      });

      if (response.ok) {
        shopify.toast.show("Announcement updated successfully!");
        // Refresh history
        await fetchAuditHistory();
      } else {
        const errorData = await response.json();
        shopify.toast.show(errorData.error || "Failed to save announcement.", { isError: true });
      }
    } catch (err) {
      shopify.toast.show("An error occurred while saving.", { isError: true });
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Prepare table rows for audit logs
  const rows = auditHistory.map((item, index) => {
    const formattedDate = new Date(item.timestamp).toLocaleString();
    return [
      formattedDate,
      item.text,
      index === 0 ? <Badge status="success">Active</Badge> : <Badge>Archived</Badge>,
    ];
  });

  return (
    <Page>
      <TitleBar title="Announcement Settings" />
      <Layout>
        <Layout.Section>
          <Banner title="Configure Storefront Announcement Banner" status="info">
            <p>
              Set a message to display live at the top of your shop's storefront. The banner is rendered floating across all pages via the <strong>Theme App Extension (App Embed Block)</strong>. Make sure you enable the extension in your theme settings.
            </p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card sectioned title="Announcement Customizer">
            <FormLayout>
              <TextField
                label="Announcement Text"
                value={announcementText}
                onChange={(value) => setAnnouncementText(value)}
                placeholder="e.g. Free shipping on orders over $50! Use code SHIP50"
                autoComplete="off"
                helpText="This message will be instantly updated on your online store storefront."
                maxLength={120}
                showCharacterCount
              />
              <Button primary onClick={handleSave} loading={isSaving}>
                Save & Publish
              </Button>
            </FormLayout>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card sectioned title="Database Audit Logs (MERN History)">
            <TextContainer>
              <p>
                A record of all past storefront announcements stored in MongoDB. This list updates automatically upon saving.
              </p>
            </TextContainer>
            <div style={{ marginTop: "15px" }}>
              {isLoadingHistory ? (
                <p>Loading history...</p>
              ) : rows.length === 0 ? (
                <p>No audit history recorded yet.</p>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text"]}
                  headings={["Date & Time", "Announcement Message", "Status"]}
                  rows={rows}
                />
              )}
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
